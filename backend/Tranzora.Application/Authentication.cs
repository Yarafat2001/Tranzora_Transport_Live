namespace Tranzora.Application;

public sealed record RegisterInput(string Name, string Company, string Email, string Phone, string Password);
public sealed record LoginInput(string Email, string Password);
public sealed record UserView(Guid Id, Guid OrganizationId, string Name, string Email, string Phone, string Role, string Status);
public sealed record AuthResult(UserView User, string Token);
public interface IAuthentication
{
    Task<AuthResult> Register(RegisterInput input, CancellationToken ct);
    Task<AuthResult> Login(LoginInput input, CancellationToken ct);
    Task<UserView?> Session(string token, CancellationToken ct);
    Task Logout(string token, CancellationToken ct);
    Task ChangePassword(Actor actor, string currentPassword, string newPassword, CancellationToken ct);
    Task RequestReset(string email, CancellationToken ct);
    Task ResetPassword(string token, string password, CancellationToken ct);
}
