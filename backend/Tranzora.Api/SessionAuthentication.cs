using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Tranzora.Application;

namespace Tranzora.Api;

public sealed class SessionAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, IAuthentication authentication)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue("tranzora_session", out var token)) return AuthenticateResult.NoResult();
        var user = await authentication.Session(token, Context.RequestAborted);
        if (user is null) return AuthenticateResult.Fail("Session expired.");
        Claim[] claims = [new(ClaimTypes.NameIdentifier, user.Id.ToString()), new("organization_id", user.OrganizationId.ToString()), new(ClaimTypes.Role, user.Role), new(ClaimTypes.Name, user.Name)];
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme.Name)), Scheme.Name));
    }
}

public static class ActorExtensions
{
    public static Actor Actor(this HttpContext context) => new(
        Guid.Parse(context.User.FindFirstValue(ClaimTypes.NameIdentifier)!),
        Guid.Parse(context.User.FindFirstValue("organization_id")!),
        context.User.FindFirstValue(ClaimTypes.Role)!);
}
