namespace Tranzora.Application;

public sealed record ExternalProfile(string Provider, string Subject, string Name, string Email);
public sealed record ExternalCompletion(AuthResult? Session = null, string? EnrollmentToken = null, bool Linked = false);
public sealed record ExternalEnrollment(string Provider, string Name, string Email);
public sealed record ExternalConnection(string Provider, DateTimeOffset CreatedAt);

public interface IExternalAuthentication
{
    Task<string> BeginLink(Actor actor, string sessionToken, string provider, CancellationToken ct);
    Task ValidateLink(string token, string sessionToken, string provider, CancellationToken ct);
    Task<ExternalCompletion> Complete(ExternalProfile profile, string? linkToken, string sessionToken, CancellationToken ct);
    Task<ExternalEnrollment> Enrollment(string token, CancellationToken ct);
    Task<AuthResult> RegisterExternal(string token, RegisterInput input, CancellationToken ct);
    Task<IReadOnlyList<ExternalConnection>> Connections(Actor actor, CancellationToken ct);
    Task Disconnect(Actor actor, string sessionToken, string provider, CancellationToken ct);
}
