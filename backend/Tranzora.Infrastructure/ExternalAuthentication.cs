using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Tranzora.Application;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed partial class Authentication
{
    private static string FlowToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    private static void Provider(string provider)
    {
        if (provider is not ("google" or "microsoft")) throw new AppException(404, "Unknown sign-in provider.");
    }
    private async Task<Session> FreshSession(Guid userId, string token, CancellationToken ct)
    {
        var hash = Hash(token);
        return await db.Sessions.SingleOrDefaultAsync(x => x.UserId == userId && x.TokenHash == hash && x.ExpiresAt > DateTimeOffset.UtcNow.AddHours(24).AddMinutes(-10), ct)
            ?? throw new AppException(401, "Sign out and sign in again before changing connected accounts.");
    }
    public async Task<string> BeginLink(Actor actor, string sessionToken, string provider, CancellationToken ct)
    {
        Provider(provider);
        await FreshSession(actor.UserId, sessionToken, ct);
        var token = FlowToken();
        db.ExternalFlows.Add(new() { TokenHash = Hash(token), Purpose = "link", Provider = provider, UserId = actor.UserId, SessionHash = Hash(sessionToken), ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10) });
        await db.SaveChangesAsync(ct);
        return token;
    }
    public async Task ValidateLink(string token, string sessionToken, string provider, CancellationToken ct)
    {
        Provider(provider);
        var flow = await db.ExternalFlows.AsNoTracking().SingleOrDefaultAsync(x => x.TokenHash == Hash(token) && x.Purpose == "link" && x.Provider == provider && x.ExpiresAt > DateTimeOffset.UtcNow, ct);
        if (flow?.UserId is not Guid userId || flow.SessionHash != Hash(sessionToken)) throw new AppException(400, "Account connection request expired or belongs to another session.");
        await FreshSession(userId, sessionToken, ct);
    }
    private async Task<ExternalFlow> LockedFlow(string token, string purpose, CancellationToken ct)
    {
        var hash = Hash(token);
        var flow = await db.ExternalFlows.FromSqlInterpolated($"SELECT * FROM \"ExternalFlows\" WHERE \"TokenHash\" = {hash} FOR UPDATE").SingleOrDefaultAsync(ct);
        return flow is not null && flow.Purpose == purpose && flow.ExpiresAt > DateTimeOffset.UtcNow ? flow : throw new AppException(400, "This sign-in request has expired or was already used. Please start again.");
    }
    public async Task<ExternalCompletion> Complete(ExternalProfile profile, string? linkToken, string sessionToken, CancellationToken ct)
    {
        Provider(profile.Provider);
        if (string.IsNullOrWhiteSpace(profile.Subject) || profile.Subject.Length > 256) throw new AppException(400, "The provider did not supply a valid account identifier.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var identity = await db.ExternalIdentities.SingleOrDefaultAsync(x => x.Provider == profile.Provider && x.Subject == profile.Subject, ct);
        if (linkToken is not null)
        {
            var flow = await LockedFlow(linkToken, "link", ct);
            if (flow.Provider != profile.Provider || flow.UserId is not Guid userId || flow.SessionHash != Hash(sessionToken)) throw new AppException(400, "Account connection request belongs to another session.");
            await FreshSession(userId, sessionToken, ct);
            var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId && x.Active, ct) ?? throw new AppException(401, "Account is unavailable.");
            if (user.LockedUntil > DateTimeOffset.UtcNow) throw new AppException(401, "Account is temporarily unavailable.");
            if (identity is not null && identity.UserId != userId) throw new AppException(409, "This provider account is already connected to another Tranzora account.");
            if (identity is null)
            {
                if (await db.ExternalIdentities.AnyAsync(x => x.UserId == userId && x.Provider == profile.Provider, ct)) throw new AppException(409, "Disconnect the existing provider account before connecting another.");
                db.ExternalIdentities.Add(new() { Provider = profile.Provider, Subject = profile.Subject, UserId = userId });
            }
            db.ExternalFlows.Remove(flow);
            db.AuditEvents.Add(new() { OrganizationId = user.OrganizationId, UserId = user.Id, RecordId = user.Id, Resource = "identity", Action = $"connect:{profile.Provider}" });
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return new(Linked: true);
        }
        if (identity is not null)
        {
            var user = await db.Users.SingleOrDefaultAsync(x => x.Id == identity.UserId && x.Active, ct) ?? throw new AppException(401, "Account is unavailable.");
            if (user.LockedUntil > DateTimeOffset.UtcNow) throw new AppException(401, "Account is temporarily unavailable.");
            identity.LastUsedAt = DateTimeOffset.UtcNow;
            user.FailedLogins = 0;
            db.AuditEvents.Add(new() { OrganizationId = user.OrganizationId, UserId = user.Id, RecordId = user.Id, Resource = "identity", Action = $"login:{profile.Provider}" });
            var session = await NewSession(user, ct);
            await tx.CommitAsync(ct);
            return new(Session: session);
        }
        // An email match never links or signs in an existing local user.
        var enrollment = FlowToken();
        db.ExternalFlows.Add(new() { TokenHash = Hash(enrollment), Purpose = "enroll", Provider = profile.Provider, Subject = profile.Subject, Name = profile.Name[..Math.Min(profile.Name.Length, 200)], Email = profile.Email[..Math.Min(profile.Email.Length, 254)], ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(10) });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return new(EnrollmentToken: enrollment);
    }
    public async Task<ExternalEnrollment> Enrollment(string token, CancellationToken ct)
    {
        var flow = await db.ExternalFlows.AsNoTracking().SingleOrDefaultAsync(x => x.TokenHash == Hash(token) && x.Purpose == "enroll" && x.ExpiresAt > DateTimeOffset.UtcNow, ct)
            ?? throw new AppException(400, "Sign-up request expired. Please sign in with your provider again.");
        return new(flow.Provider, flow.Name, flow.Email);
    }
    public async Task<AuthResult> RegisterExternal(string token, RegisterInput input, CancellationToken ct)
    {
        var email = ValidateRegistration(input);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var flow = await LockedFlow(token, "enroll", ct);
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) throw new AppException(409, "This email already has an account. Sign in with your password and connect the provider from My profile.");
        if (await db.ExternalIdentities.AnyAsync(x => x.Provider == flow.Provider && x.Subject == flow.Subject, ct)) throw new AppException(409, "This provider account is already connected. Sign in again.");
        var organization = new Organization { Name = input.Company.Trim() };
        var user = new User { OrganizationId = organization.Id, Name = input.Name.Trim(), Email = email, Phone = input.Phone.Trim(), Role = "Business Admin" };
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        db.Organizations.Add(organization);
        db.Users.Add(user);
        db.ExternalIdentities.Add(new() { Provider = flow.Provider, Subject = flow.Subject, UserId = user.Id });
        db.ExternalFlows.Remove(flow);
        db.AuditEvents.Add(new() { OrganizationId = user.OrganizationId, UserId = user.Id, RecordId = user.Id, Resource = "identity", Action = $"register:{flow.Provider}" });
        var result = await NewSession(user, ct);
        await tx.CommitAsync(ct);
        return result;
    }
    public async Task<IReadOnlyList<ExternalConnection>> Connections(Actor actor, CancellationToken ct) => await db.ExternalIdentities.AsNoTracking().Where(x => x.UserId == actor.UserId).Select(x => new ExternalConnection(x.Provider, x.CreatedAt)).ToArrayAsync(ct);
    public async Task Disconnect(Actor actor, string sessionToken, string provider, CancellationToken ct)
    {
        Provider(provider);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await FreshSession(actor.UserId, sessionToken, ct);
        var identity = await db.ExternalIdentities.SingleOrDefaultAsync(x => x.UserId == actor.UserId && x.Provider == provider, ct);
        if (identity is not null)
        {
            db.ExternalIdentities.Remove(identity);
            var hash = Hash(sessionToken);
            await db.Sessions.Where(x => x.UserId == actor.UserId && x.TokenHash != hash).ExecuteDeleteAsync(ct);
            db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, RecordId = actor.UserId, Resource = "identity", Action = $"disconnect:{provider}" });
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
    }
}
