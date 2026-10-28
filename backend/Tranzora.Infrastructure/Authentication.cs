using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Tranzora.Application;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed partial class Authentication(AppDbContext db, IPasswordHasher<User> hasher, IConfiguration config) : IAuthentication, IExternalAuthentication
{
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static UserView View(User user) => new(user.Id, user.OrganizationId, user.Name, user.Email, user.Phone, user.Role, user.Active ? "Active" : "Inactive");
    public static void ValidatePassword(string? value)
    {
        if (value is null || value.Length is < 8 or > 128 || !value.Any(char.IsLetter) || !value.Any(char.IsDigit) || !value.Any(c => !char.IsLetterOrDigit(c) && !char.IsWhiteSpace(c)))
            throw new AppException(400, "Use a password of 8–128 characters with letters, numbers and a symbol.");
    }
    public static string NormalizeEmail(string? value)
    {
        var email = value?.Trim().ToLowerInvariant() ?? "";
        if (email.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(email, out var parsed) || parsed.Address != email)
            throw new AppException(400, "Enter a valid email address.");
        return email;
    }
    public async Task<AuthResult> Register(RegisterInput input, CancellationToken ct)
    {
        var email = ValidateRegistration(input);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var organization = new Organization { Name = input.Company.Trim() };
        var user = new User { OrganizationId = organization.Id, Name = input.Name.Trim(), Email = email, Phone = input.Phone.Trim(), Role = "Business Admin" };
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        db.Organizations.Add(organization);
        db.Users.Add(user);
        var result = await NewSession(user, ct);
        await tx.CommitAsync(ct);
        return result;
    }
    private static string ValidateRegistration(RegisterInput input)
    {
        ValidatePassword(input.Password);
        var email = NormalizeEmail(input.Email);
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200 || string.IsNullOrWhiteSpace(input.Company) || input.Company.Length > 200 || string.IsNullOrWhiteSpace(input.Phone) || input.Phone.Length > 40 || input.Phone.Count(char.IsDigit) < 7)
            throw new AppException(400, "Name, company and a valid phone are required.");
        return email;
    }
    public async Task<AuthResult> Login(LoginInput input, CancellationToken ct)
    {
        var email = NormalizeEmail(input.Email);
        if (input.Password is null || input.Password.Length > 128) throw new AppException(401, "Invalid email or password.");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Email\" = {email} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (user is null)
        {
            // Keep the expensive password check on the unknown-account path too.
            hasher.VerifyHashedPassword(new User(), DummyPasswordHash, input.Password);
            throw new AppException(401, "Invalid email or password.");
        }
        if (!user.Active || user.LockedUntil > DateTimeOffset.UtcNow) throw new AppException(401, "Invalid email or password, or account temporarily unavailable.");
        var verification = hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password);
        if (verification == PasswordVerificationResult.Failed)
        {
            user.FailedLogins++;
            if (user.FailedLogins >= 5) { user.LockedUntil = DateTimeOffset.UtcNow.AddMinutes(15); user.FailedLogins = 0; }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            throw new AppException(401, "Invalid email or password.");
        }
        user.FailedLogins = 0;
        user.LockedUntil = null;
        if (verification == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, input.Password);
        var result = await NewSession(user, ct);
        await tx.CommitAsync(ct);
        return result;
    }
    private static readonly string DummyPasswordHash = new PasswordHasher<User>().HashPassword(new User(), Convert.ToHexString(RandomNumberGenerator.GetBytes(32)));
    private async Task<AuthResult> NewSession(User user, CancellationToken ct)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.Sessions.Add(new() { UserId = user.Id, TokenHash = Hash(token), ExpiresAt = DateTimeOffset.UtcNow.AddHours(24) });
        await db.SaveChangesAsync(ct);
        return new(View(user), token);
    }
    public async Task<UserView?> Session(string token, CancellationToken ct)
    {
        if (token.Length != 64) return null;
        var hash = Hash(token);
        var user = await (from session in db.Sessions.AsNoTracking()
                          join account in db.Users.AsNoTracking() on session.UserId equals account.Id
                          where session.TokenHash == hash && session.ExpiresAt > DateTimeOffset.UtcNow && account.Active
                          select account).SingleOrDefaultAsync(ct);
        return user is null ? null : View(user);
    }
    public Task Logout(string token, CancellationToken ct) => db.Sessions.Where(x => x.TokenHash == Hash(token)).ExecuteDeleteAsync(ct);
    public async Task ChangePassword(Actor actor, string currentPassword, string newPassword, CancellationToken ct)
    {
        ValidatePassword(newPassword);
        if (string.IsNullOrEmpty(currentPassword) || currentPassword.Length > 128) throw new AppException(400, "Current password is required.");
        var user = await db.Users.SingleAsync(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId, ct);
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword) == PasswordVerificationResult.Failed)
            throw new AppException(400, "Current password is incorrect.");
        user.PasswordHash = hasher.HashPassword(user, newPassword);
        await db.Sessions.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
    }
    public async Task RequestReset(string email, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(config["Smtp:Host"]) || string.IsNullOrWhiteSpace(config["Smtp:From"]))
            throw new AppException(503, "Password recovery email is not configured.");
        var normalized = NormalizeEmail(email);
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == normalized && x.Active, ct);
        if (user is null) return;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.PasswordResets.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(ct);
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.PasswordResets.Add(new() { TokenHash = Hash(token), UserId = user.Id, ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30) });
        db.Set<MailMessage>().Add(new() { Recipient = user.Email, Subject = "Reset your Tranzora password", Body = $"Reset your password within 30 minutes: {config["App:PublicOrigin"]}/reset-password?token={token}" });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
    public async Task ResetPassword(string token, string password, CancellationToken ct)
    {
        ValidatePassword(password);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var hash = Hash(token);
        var reset = await db.PasswordResets.FromSqlInterpolated($"SELECT * FROM \"PasswordResets\" WHERE \"TokenHash\" = {hash} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (reset is null || reset.ExpiresAt <= DateTimeOffset.UtcNow) throw new AppException(400, "Reset link is invalid or expired.");
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == reset.UserId && x.Active, ct) ?? throw new AppException(400, "Reset link is invalid or expired.");
        user.PasswordHash = hasher.HashPassword(user, password);
        user.FailedLogins = 0;
        user.LockedUntil = null;
        await db.Sessions.Where(x => x.UserId == user.Id).ExecuteDeleteAsync(ct);
        db.PasswordResets.Remove(reset);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
