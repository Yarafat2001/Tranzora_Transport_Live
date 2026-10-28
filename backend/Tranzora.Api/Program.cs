using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Tranzora.Api;
using Tranzora.Application;
using Tranzora.Domain;
using Tranzora.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Render supplies PORT at runtime; an explicit URL binding takes precedence.
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ASPNETCORE_URLS")) &&
    int.TryParse(builder.Configuration["PORT"], out var renderPort) && renderPort is > 0 and <= 65535)
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{renderPort}");
}

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();

builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 65536);

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
    DeploymentConnections.Postgres(builder.Configuration),
    postgres => postgres.CommandTimeout(15)));

builder.Services.AddScoped<IRecordStore, RecordStore>();
builder.Services.AddScoped<IOperations, Operations>();
builder.Services.AddScoped<IAuthentication, Tranzora.Infrastructure.Authentication>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.Configure<PasswordHasherOptions>(options => options.IterationCount = 210000);
builder.Services.AddScoped<ReadCache>();
builder.Services.AddScoped<DemoSeeder>();
builder.Services.AddScoped<IDriverWorkspace, DriverWorkspace>();

var redis = builder.Configuration.GetConnectionString("Redis");
if (!string.IsNullOrWhiteSpace(redis))
{
    builder.Services.AddStackExchangeRedisCache(options => options.ConfigurationOptions = DeploymentConnections.Redis(redis));
}
else
{
    // Single-instance development only; revision remains database-backed.
    builder.Services.AddDistributedMemoryCache();
}

builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", _ => { });
builder.AddExternalSignIn();
builder.Services.AddAuthorization();
builder.Services.AddOpenApi();
builder.Services.AddHostedService<BackgroundMaintenance>();

var allowedOrigins = WebSecurity.Origins(builder.Configuration);
builder.Services.AddCors(options =>
{
    options.AddPolicy("web", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials()
              .WithExposedHeaders("ETag", "Location", "Idempotency-Replayed", "X-Request-Id");
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    foreach (var proxy in builder.Configuration.GetSection("App:KnownProxies").Get<string[]>() ?? [])
    {
        options.KnownProxies.Add(IPAddress.Parse(proxy));
    }
});

// Validate the cookie policy at startup; it drives the session and external-auth cookies.
_ = WebSecurity.SameSite(builder.Configuration);

var app = builder.Build();

// Optional startup migration step. Only applies when RUN_MIGRATIONS=true;
// API replicas never race to change the schema otherwise.
// Errors are logged, not fatal: the schema may already exist
// (e.g. applied by a previous deploy or a separate migration job).
if (string.Equals(Environment.GetEnvironmentVariable("RUN_MIGRATIONS"), "true", StringComparison.OrdinalIgnoreCase))
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    try
    {
        await using var scope = app.Services.CreateAsyncScope();
        logger.LogInformation("Schema step: {Result}", await SchemaMigrations.ApplyAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>()));
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Startup schema step failed; continuing without applying migrations.");
    }
}

// One-off CLI commands. Each runs against a fresh service scope and exits.
if (await RunCommandAsync(args, app.Services)) return;

app.UseForwardedHeaders();
app.UseCors("web");
app.UseMiddleware<ApiErrors>();
app.UseMiddleware<RequestSecurity>();
app.UseExternalPublicOrigin();
app.UseAuthentication();
app.UseMiddleware<SharedRateLimit>();
app.UseAuthorization();
app.UseMiddleware<TransactionalRequests>();

static IResult HealthOk() => Results.Ok(new { status = "ok" });

app.MapGet("/health", HealthOk).AllowAnonymous();
app.MapGet("/health/live", HealthOk).AllowAnonymous();

app.MapGet("/health/ready", async (AppDbContext db, HttpContext context, ILogger<Program> logger, CancellationToken ct) =>
{
    try
    {
        if (!await db.Database.CanConnectAsync(ct))
        {
            return Results.Json(new { status = "degraded", database = "unavailable" }, statusCode: 503);
        }

        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
        if (pending.Count > 0)
        {
            return Results.Json(new { status = "degraded", database = $"migrations pending: {string.Join(", ", pending)}" }, statusCode: 503);
        }

        object? outbox = null;
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var actor = context.Actor();
            if (actor.Role is "Super Admin" or "Business Admin")
            {
                var recipients = db.Users.Where(user => user.OrganizationId == actor.OrganizationId).Select(user => user.Email);
                var queue = db.Set<MailMessage>().Where(mail => recipients.Contains(mail.Recipient));
                outbox = new
                {
                    pending = await queue.CountAsync(mail => mail.Attempts < 8, ct),
                    exhausted = await queue.CountAsync(mail => mail.Attempts >= 8, ct)
                };
            }
        }
        return Results.Ok(new { status = "ok", database = "connected", outbox });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Readiness check failed.");
        return Results.Json(new { status = "degraded", database = "unavailable" }, statusCode: 503);
    }
}).AllowAnonymous();

if (app.Environment.IsDevelopment()) app.MapOpenApi();

var auth = app.MapGroup("/api/auth");
auth.MapAuthEndpoints(builder.Configuration);

var api = app.MapGroup("/api/v1").RequireAuthorization();
api.MapDriverEndpoints();
api.MapAccountEndpoints();
api.MapUserEndpoints();
api.MapResourceEndpoints();

api.MapGet("/schemas", (IOperations operations, HttpContext context) => Results.Ok(operations.Schemas.Where(schema =>
{
    try { Permissions.Demand(context.Actor(), schema.Name, false); return true; }
    catch (AppException) { return false; }
}).Select(schema => new { schema.Name, schema.Fields, schema.Required, schema.Statuses, canWrite = EndpointExtensions.CanWrite(context.Actor(), schema.Name) })));

app.Run();

static async Task<bool> RunCommandAsync(string[] args, IServiceProvider services)
{
    if (args.Contains("--migrate"))
    {
        await using var scope = services.CreateAsyncScope();
        Console.WriteLine(await SchemaMigrations.ApplyAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>()));
        return true;
    }
    if (args.Contains("--print-schema"))
    {
        await using var scope = services.CreateAsyncScope();
        Console.Write(scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.GenerateCreateScript());
        return true;
    }
    if (args.Contains("--seed-demo"))
    {
        await using var scope = services.CreateAsyncScope();
        var result = await scope.ServiceProvider.GetRequiredService<DemoSeeder>().Seed();
        Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }));
        Console.WriteLine("New demo accounts use the password documented in docs/demo-data.md. Existing account passwords and edited records are preserved.");
        return true;
    }
    return false;
}

public sealed record PageParameters(int Page = 1, int PageSize = 20, string? Search = null, string? Status = null)
{
    public PageQuery ToQuery() => new(Page, PageSize, Search, Status);
}
public sealed record ResetRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string Password);
public sealed record ChangePasswordInput(string CurrentPassword, string NewPassword);
public sealed record ProfileInput(string Name, string? Phone);
public sealed record WorkspaceInput(string Name, long Version);
public sealed record CreateUserInput(string Name, string Email, string? Phone, string Role, string Password, Guid? DriverId = null);
public sealed record UpdateUserInput(string Role, bool Active, Guid? DriverId = null);
public partial class Program;