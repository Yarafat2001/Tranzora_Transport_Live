using System.Security.Claims;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.DataProtection;
using Tranzora.Application;
using Tranzora.Infrastructure;

namespace Tranzora.Api;

public static class ExternalSignIn
{
    private const string EnrollmentCookie = "tranzora_external_enrollment";
    private static readonly string[] Providers = ["google", "microsoft"];
    public static bool Enabled(IConfiguration config, string provider) => Providers.Contains(provider) && !string.IsNullOrWhiteSpace(config[$"Authentication:{provider}:ClientId"]) && !string.IsNullOrWhiteSpace(config[$"Authentication:{provider}:ClientSecret"]);
    public static Uri Origin(IConfiguration config) => new(config["App:PublicOrigin"]!);
    public static CookieOptions Cookie(IConfiguration config, bool enrollment = false) => new()
    {
        HttpOnly = true, SameSite = SameSiteMode.Lax, Secure = config.GetValue("App:SecureCookies", true), Path = enrollment ? "/api/auth/external" : "/", MaxAge = enrollment ? TimeSpan.FromMinutes(10) : TimeSpan.FromHours(24), IsEssential = true
    };
    public static void AddExternalSignIn(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        if (!Uri.TryCreate(config["App:PublicOrigin"], UriKind.Absolute, out var origin) || origin.Scheme is not ("http" or "https") || origin.AbsolutePath != "/" || !string.IsNullOrEmpty(origin.Query) || !string.IsNullOrEmpty(origin.Fragment) || !string.IsNullOrEmpty(origin.UserInfo))
            throw new InvalidOperationException("App:PublicOrigin must be a single HTTP(S) origin without a path, credentials, or query.");
        if (!origin.IsLoopback && (origin.Scheme != "https" || !config.GetValue("App:SecureCookies", true))) throw new InvalidOperationException("Public deployments require HTTPS and App:SecureCookies=true.");
        foreach (var provider in Providers)
            if (string.IsNullOrWhiteSpace(config[$"Authentication:{provider}:ClientId"]) != string.IsNullOrWhiteSpace(config[$"Authentication:{provider}:ClientSecret"]))
                throw new InvalidOperationException($"Configure both Authentication:{provider}:ClientId and ClientSecret.");
        var testingUrl = config["Authentication:TestProviderBaseUrl"];
        if (testingUrl is not null && (!builder.Environment.IsEnvironment("Testing") || !Uri.TryCreate(testingUrl, UriKind.Absolute, out var testingOrigin) || !testingOrigin.IsLoopback))
            throw new InvalidOperationException("Mock identity endpoints are restricted to the Testing environment on loopback.");
        var protection = builder.Services.AddDataProtection().SetApplicationName("Tranzora.ExternalSignIn.v1").PersistKeysToDbContext<AppDbContext>();
        var certificatePath = config["Authentication:KeyEncryptionCertificatePath"];
        if (!string.IsNullOrWhiteSpace(certificatePath)) protection.ProtectKeysWithCertificate(X509CertificateLoader.LoadPkcs12FromFile(certificatePath, config["Authentication:KeyEncryptionCertificatePassword"]));
        else if (!origin.IsLoopback && Providers.Any(provider => Enabled(config, provider))) throw new InvalidOperationException("Configure Authentication:KeyEncryptionCertificatePath to encrypt the shared OAuth key ring before enabling public provider sign-in.");
        builder.Services.AddScoped<IExternalAuthentication, Tranzora.Infrastructure.Authentication>();
        var authentication = builder.Services.AddAuthentication().AddCookie("External", options => { options.Cookie.Name = "tranzora_external_ticket"; options.ExpireTimeSpan = TimeSpan.FromMinutes(5); options.Cookie.HttpOnly = true; options.Cookie.SecurePolicy = CookieSecurePolicy.Always; });
        if (Enabled(config, "google")) authentication.AddGoogle("google", options => Configure(options, "google", config));
        if (Enabled(config, "microsoft")) authentication.AddMicrosoftAccount("microsoft", options => Configure(options, "microsoft", config));
    }
    private static void Configure(OAuthOptions options, string provider, IConfiguration config)
    {
        options.ClientId = config[$"Authentication:{provider}:ClientId"]!;
        options.ClientSecret = config[$"Authentication:{provider}:ClientSecret"]!;
        options.CallbackPath = $"/api/auth/callback/{provider}";
        options.SignInScheme = "External";
        options.UsePkce = true;
        options.SaveTokens = false;
        options.RemoteAuthenticationTimeout = TimeSpan.FromMinutes(10);
        options.CorrelationCookie.Name = $".tranzora.oauth.{provider}.";
        options.CorrelationCookie.SameSite = SameSiteMode.Lax;
        options.CorrelationCookie.SecurePolicy = config.GetValue("App:SecureCookies", true) ? CookieSecurePolicy.Always : CookieSecurePolicy.None;
        if (config["Authentication:TestProviderBaseUrl"] is string testingUrl)
        {
            options.AuthorizationEndpoint = $"{testingUrl}/{provider}/authorize";
            options.TokenEndpoint = $"{testingUrl}/{provider}/token";
            options.UserInformationEndpoint = $"{testingUrl}/{provider}/userinfo";
        }
        options.Events = new OAuthEvents
        {
            OnRemoteFailure = context =>
            {
                context.HandleResponse();
                context.Response.Redirect(new Uri(Origin(config), "/login?oauth_error=" + Uri.EscapeDataString("Provider sign-in was cancelled, expired, or could not be verified. Please try again.")).AbsoluteUri);
                return Task.CompletedTask;
            },
            OnTicketReceived = async context =>
            {
                context.HandleResponse();
                var identity = context.Principal!;
                var profile = new ExternalProfile(provider, identity.FindFirstValue(ClaimTypes.NameIdentifier) ?? "", identity.FindFirstValue(ClaimTypes.Name) ?? "", identity.FindFirstValue(ClaimTypes.Email) ?? "");
                try
                {
                    var service = context.HttpContext.RequestServices.GetRequiredService<IExternalAuthentication>();
                    string? linkToken = null;
                    context.Properties?.Items.TryGetValue("tranzora.link", out linkToken);
                    var result = await service.Complete(profile, linkToken, context.Request.Cookies["tranzora_session"] ?? "", context.HttpContext.RequestAborted);
                    var destination = "/settings/profile?connected=" + provider;
                    if (result.Session is not null)
                    {
                        context.Response.Cookies.Append("tranzora_session", result.Session.Token, Cookie(config));
                        destination = result.Session.User.Role == "Driver" ? "/driver" : result.Session.User.Role == "Support Staff" ? "/help-support" : "/dashboard";
                    }
                    else if (result.EnrollmentToken is not null)
                    {
                        context.Response.Cookies.Append(EnrollmentCookie, result.EnrollmentToken, Cookie(config, true));
                        destination = "/register?external=" + provider;
                    }
                    context.Response.Redirect(new Uri(Origin(config), destination).AbsoluteUri);
                }
                catch (AppException error)
                {
                    context.Response.Redirect(new Uri(Origin(config), "/login?oauth_error=" + Uri.EscapeDataString(error.Message)).AbsoluteUri);
                }
                catch (Microsoft.EntityFrameworkCore.DbUpdateException)
                {
                    context.Response.Redirect(new Uri(Origin(config), "/login?oauth_error=" + Uri.EscapeDataString("This identity was connected elsewhere. Sign in with your password to review connected accounts.")).AbsoluteUri);
                }
            }
        };
    }
    public static void UseExternalPublicOrigin(this WebApplication app)
    {
        // The BFF's internal host must never become the provider's callback URL.
        // The fixed, validated configuration is authoritative, not request headers.
        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/api/auth"))
            {
                var origin = Origin(app.Configuration);
                context.Request.Scheme = origin.Scheme;
                context.Request.Host = HostString.FromUriComponent(origin);
            }
            await next(context);
        });
    }
    public static void MapExternalSignIn(this RouteGroupBuilder auth, IConfiguration config)
    {
        auth.MapGet("/providers", () => Providers.Select(provider => new { provider, enabled = Enabled(config, provider) }));
        auth.MapGet("/connections", async (HttpContext context, IExternalAuthentication service, CancellationToken ct) => await service.Connections(context.Actor(), ct)).RequireAuthorization();
        auth.MapPost("/connections/{provider}", async (string provider, HttpContext context, IExternalAuthentication service, CancellationToken ct) =>
        {
            if (!Enabled(config, provider)) throw new AppException(503, "This sign-in provider is not configured.");
            var token = await service.BeginLink(context.Actor(), context.Request.Cookies["tranzora_session"] ?? "", provider, ct);
            return Results.Ok(new { url = $"/api/auth/{provider}?link={token}" });
        }).RequireAuthorization();
        auth.MapDelete("/connections/{provider}", async (string provider, HttpContext context, IExternalAuthentication service, CancellationToken ct) =>
        {
            await service.Disconnect(context.Actor(), context.Request.Cookies["tranzora_session"] ?? "", provider, ct);
            return Results.Ok(new { ok = true });
        }).RequireAuthorization();
        auth.MapGet("/external/enrollment", async (HttpContext context, IExternalAuthentication service, CancellationToken ct) => await service.Enrollment(context.Request.Cookies[EnrollmentCookie] ?? "", ct));
        auth.MapPost("/external/register", async (RegisterInput input, HttpContext context, IExternalAuthentication service, CancellationToken ct) =>
        {
            var result = await service.RegisterExternal(context.Request.Cookies[EnrollmentCookie] ?? "", input, ct);
            context.Response.Cookies.Append("tranzora_session", result.Token, Cookie(config));
            context.Response.Cookies.Delete(EnrollmentCookie, Cookie(config, true));
            return Results.Json(new { user = result.User }, statusCode: 201);
        });
        auth.MapGet("/{provider}", async (string provider, HttpContext context, IExternalAuthentication service, CancellationToken ct) =>
        {
            if (!Providers.Contains(provider)) return Results.NotFound();
            if (!Enabled(config, provider)) return Results.Redirect(new Uri(Origin(config), "/login?oauth_error=" + Uri.EscapeDataString("This provider is not configured yet. Use email and password or contact your administrator.")).AbsoluteUri);
            var properties = new AuthenticationProperties { RedirectUri = new Uri(Origin(config), "/login").AbsoluteUri };
            if (context.Request.Query["link"].FirstOrDefault() is string token)
            {
                await service.ValidateLink(token, context.Request.Cookies["tranzora_session"] ?? "", provider, ct);
                properties.Items["tranzora.link"] = token;
            }
            return Results.Challenge(properties, [provider]);
        });
    }
}
