using System.Net;
using System.Security.Claims;
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
if (!string.IsNullOrWhiteSpace(redis)) builder.Services.AddStackExchangeRedisCache(options => options.ConfigurationOptions = DeploymentConnections.Redis(redis));
else builder.Services.AddDistributedMemoryCache(); // Single-instance development only; revision remains database-backed.
builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", _ => { });
builder.AddExternalSignIn();
builder.Services.AddAuthorization();
builder.Services.AddOpenApi();
builder.Services.AddHostedService<BackgroundMaintenance>();
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    foreach (var proxy in builder.Configuration.GetSection("App:KnownProxies").Get<string[]>() ?? []) options.KnownProxies.Add(IPAddress.Parse(proxy));
});
var app = builder.Build();

// Migrations are a separate deployment job; API replicas never race to change the schema.
if (args.Contains("--migrate"))
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    return;
}
if (args.Contains("--print-schema"))
{
    await using var scope = app.Services.CreateAsyncScope();
    Console.Write(scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.GenerateCreateScript());
    return;
}
if (args.Contains("--seed-demo"))
{
    await using var scope = app.Services.CreateAsyncScope();
    var result = await scope.ServiceProvider.GetRequiredService<DemoSeeder>().Seed();
    Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true }));
    Console.WriteLine("New demo accounts use the password documented in docs/demo-data.md. Existing account passwords and edited records are preserved.");
    return;
}
app.UseForwardedHeaders();
app.UseMiddleware<ApiErrors>();
app.UseMiddleware<RequestSecurity>();
app.UseExternalPublicOrigin();
app.UseAuthentication();
app.UseMiddleware<SharedRateLimit>();
app.UseAuthorization();
app.UseMiddleware<TransactionalRequests>();
app.MapGet("/health/live", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapGet("/health/ready", async (AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    try
    {
        var connected = await db.Database.CanConnectAsync(ct);
        var pending = connected ? await db.Database.GetPendingMigrationsAsync(ct) : ["unreachable"];
        if (!connected || pending.Any()) return Results.Json(new { status = "degraded", database = "unavailable or migrations pending" }, statusCode: 503);
        object? outbox = null;
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var actor = context.Actor();
            if (actor.Role is "Super Admin" or "Business Admin")
            {
                var recipients = db.Users.Where(user => user.OrganizationId == actor.OrganizationId).Select(user => user.Email);
                var queue = db.Set<MailMessage>().Where(mail => recipients.Contains(mail.Recipient));
                outbox = new { pending = await queue.CountAsync(mail => mail.Attempts < 8, ct), exhausted = await queue.CountAsync(mail => mail.Attempts >= 8, ct) };
            }
        }
        return Results.Ok(new { status = "ok", database = "connected", outbox });
    }
    catch { return Results.Json(new { status = "degraded", database = "unavailable" }, statusCode: 503); }
}).AllowAnonymous();
if (app.Environment.IsDevelopment()) app.MapOpenApi();

CookieOptions SessionCookie() => new()
{
    HttpOnly = true,
    SameSite = SameSiteMode.Lax,
    Secure = builder.Configuration.GetValue("App:SecureCookies", true),
    Path = "/",
    MaxAge = TimeSpan.FromHours(24),
    IsEssential = true
};
var auth = app.MapGroup("/api/auth");
auth.MapPost("/register", async (RegisterInput input, IAuthentication authentication, HttpContext context, CancellationToken ct) =>
{
    var result = await authentication.Register(input, ct);
    context.Response.Cookies.Append("tranzora_session", result.Token, SessionCookie());
    return Results.Json(new { user = result.User }, statusCode: 201);
});
auth.MapPost("/login", async (LoginInput input, IAuthentication authentication, HttpContext context, CancellationToken ct) =>
{
    var result = await authentication.Login(input, ct);
    context.Response.Cookies.Append("tranzora_session", result.Token, SessionCookie());
    return Results.Ok(new { user = result.User });
});
auth.MapGet("/session", async (IAuthentication authentication, HttpContext context, CancellationToken ct) =>
{
    var user = await authentication.Session(context.Request.Cookies["tranzora_session"] ?? "", ct);
    return user is null ? Results.Json(new { user = (object?)null }, statusCode: 401) : Results.Ok(new { user });
});
auth.MapPost("/logout", async (IAuthentication authentication, HttpContext context, CancellationToken ct) =>
{
    await authentication.Logout(context.Request.Cookies["tranzora_session"] ?? "", ct);
    context.Response.Cookies.Delete("tranzora_session", new CookieOptions { Path = "/" });
    return Results.Ok(new { ok = true });
});
auth.MapPost("/forgot-password", async (ResetRequest input, IAuthentication authentication, CancellationToken ct) =>
{
    await authentication.RequestReset(input.Email, ct);
    return Results.Ok(new { message = "If the account exists, a reset link will be emailed." });
});
auth.MapPost("/reset-password", async (ResetPasswordRequest input, IAuthentication authentication, CancellationToken ct) =>
{
    await authentication.ResetPassword(input.Token, input.Password, ct);
    return Results.Ok(new { message = "Password reset. Sign in again." });
});
auth.MapExternalSignIn(builder.Configuration);

var api = app.MapGroup("/api/v1").RequireAuthorization();
api.MapDriverEndpoints();
api.MapGet("/schemas", (IOperations operations, HttpContext context) => Results.Ok(operations.Schemas.Where(schema =>
{
    try { Permissions.Demand(context.Actor(), schema.Name, false); return true; } catch (AppException) { return false; }
}).Select(schema => new { schema.Name, schema.Fields, schema.Required, schema.Statuses, canWrite = CanWrite(context.Actor(), schema.Name) })));
api.MapGet("/dashboard", async (IOperations operations, ReadCache cache, HttpContext context, CancellationToken ct) =>
{
    Permissions.Demand(context.Actor(), "dashboard", false);
    var json = await cache.Get(context.Actor(), "dashboard", () => operations.Dashboard(context.Actor(), ct), ct);
    return Results.Content(json, "application/json");
});
api.MapGet("/audit-logs", async ([AsParameters] PageParameters query, IOperations operations, HttpContext context, CancellationToken ct) =>
    Results.Ok(await operations.Audit(context.Actor(), query.ToQuery(), ct)));

api.MapGet("/profile", async (AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    var actor = context.Actor();
    return Results.Ok(await db.Users.Where(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId)
        .Select(x => new { x.Id, x.Name, x.Email, x.Phone, x.Role, x.Version }).SingleAsync(ct));
});
api.MapPut("/profile", async (ProfileInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200 || input.Phone?.Length > 40) throw new AppException(400, "A name and valid phone are required.");
    var actor = context.Actor();
    var user = await db.Users.SingleAsync(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId, ct);
    if (user.Version != ParseVersion(context)) throw new AppException(412, "Profile changed. Reload before editing.");
    user.Name = input.Name.Trim(); user.Phone = input.Phone ?? "";
    user.Version++;
    db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = "update", Resource = "profile", RecordId = user.Id });
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { user.Id, user.Name, user.Email, user.Phone, user.Role, user.Version });
});
api.MapPost("/password", async (ChangePasswordInput input, IAuthentication authentication, HttpContext context, CancellationToken ct) =>
{
    await authentication.ChangePassword(context.Actor(), input.CurrentPassword, input.NewPassword, ct);
    return Results.Ok(new { message = "Password changed. Sign in again." });
});
api.MapGet("/settings", async (AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    Permissions.Demand(context.Actor(), "settings", false);
    return Results.Ok(await db.Organizations.Where(x => x.Id == context.Actor().OrganizationId).Select(x => new { x.Name, x.Currency, version = x.Revision }).SingleAsync(ct));
});
api.MapPut("/settings", async (WorkspaceInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    var actor = context.Actor(); Permissions.Demand(actor, "settings", true);
    if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200) throw new AppException(400, "Workspace name is required.");
    var organization = await db.Organizations.SingleAsync(x => x.Id == actor.OrganizationId, ct);
    if (organization.Revision != input.Version) throw new AppException(412, "Workspace changed. Reload before saving.");
    organization.Name = input.Name.Trim();
    db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Resource = "settings", Action = "update", RecordId = organization.Id });
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { organization.Name, organization.Currency, version = organization.Revision + 1 });
});
api.MapGet("/users", async ([AsParameters] PageParameters parameters, AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    Permissions.Demand(context.Actor(), "users", false);
    var query = parameters.ToQuery(); Operations.ValidatePage(query);
    var rows = db.Users.AsNoTracking().Where(x => x.OrganizationId == context.Actor().OrganizationId);
    if (!string.IsNullOrWhiteSpace(query.Search)) rows = rows.Where(x => x.Name.ToLower().Contains(query.Search.ToLower()) || x.Email.Contains(query.Search.ToLower()));
    var total = await rows.LongCountAsync(ct);
    var items = await rows.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
        .Select(x => new { x.Id, x.Name, x.Email, x.Phone, x.Role, x.DriverId, x.Version, status = x.Active ? "Active" : "Inactive" }).ToArrayAsync(ct);
    return Results.Ok(new PageResult(items.Cast<object>().ToArray(), query.Page, query.PageSize, total));
});
api.MapPost("/users", async (CreateUserInput input, AppDbContext db, IPasswordHasher<User> hasher, HttpContext context, CancellationToken ct) =>
{
    var actor = context.Actor(); Permissions.Demand(actor, "users", true);
    Tranzora.Infrastructure.Authentication.ValidatePassword(input.Password);
    if (!Permissions.Roles.Contains(input.Role) || string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200) throw new AppException(400, "Name and a valid role are required.");
    if (input.DriverId.HasValue && (input.Role != "Driver" || !await db.Set<Driver>().AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id == input.DriverId, ct))) throw new AppException(422, "Select a driver in this organization for a Driver account.");
    var user = new User { OrganizationId = actor.OrganizationId, Name = input.Name.Trim(), Email = Tranzora.Infrastructure.Authentication.NormalizeEmail(input.Email), Phone = input.Phone ?? "", Role = input.Role };
    user.PasswordHash = hasher.HashPassword(user, input.Password);
    user.DriverId = input.DriverId;
    db.Users.Add(user);
    db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = "create", Resource = "users", RecordId = user.Id });
    await db.SaveChangesAsync(ct);
    return Results.Json(new { user.Id, user.Name, user.Email, user.Role, user.Version }, statusCode: 201);
});
api.MapPut("/users/{id:guid}", async (Guid id, UpdateUserInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
{
    var actor = context.Actor(); Permissions.Demand(actor, "users", true);
    if (!Permissions.Roles.Contains(input.Role)) throw new AppException(400, "Invalid role.");
    if (input.DriverId.HasValue && (input.Role != "Driver" || !await db.Set<Driver>().AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id == input.DriverId, ct))) throw new AppException(422, "Select a driver in this organization for a Driver account.");
    if (id == actor.UserId) throw new AppException(409, "You cannot change your own role or deactivate your own account.");
    var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id && x.OrganizationId == actor.OrganizationId, ct) ?? throw new AppException(404, "User not found.");
    if (user.Version != ParseVersion(context)) throw new AppException(412, "User changed. Reload before editing.");
    if (user.Role == "Super Admin" && (input.Role != "Super Admin" || !input.Active) && !await db.Users.AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id != id && x.Role == "Super Admin" && x.Active, ct))
        throw new AppException(409, "At least one active Super Admin is required.");
    user.Role = input.Role; user.Active = input.Active;
    user.DriverId = input.DriverId;
    user.Version++;
    await db.Sessions.Where(x => x.UserId == id).ExecuteDeleteAsync(ct);
    db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = "update", Resource = "users", RecordId = id });
    await db.SaveChangesAsync(ct);
    return Results.Ok(new { user.Id, user.Name, user.Email, user.Role, user.Active, user.Version });
});

api.MapGet("/{resource}", async (string resource, [AsParameters] PageParameters query, IOperations operations, ReadCache cache, HttpContext context, CancellationToken ct) =>
{
    Permissions.Demand(context.Actor(), resource, false);
    Operations.ValidatePage(query.ToQuery());
    var json = await cache.Get(context.Actor(), $"{resource}:{context.Request.QueryString}", async () => await operations.List(context.Actor(), resource, query.ToQuery(), ct), ct);
    return Results.Content(json, "application/json");
});
api.MapGet("/{resource}/{id:guid}", async (string resource, Guid id, IOperations operations, HttpContext context, CancellationToken ct) =>
{
    var record = await operations.Get(context.Actor(), resource, id, ct);
    context.Response.Headers.ETag = $"\"{record.Version}\"";
    return Results.Json<object>(record);
});
api.MapPost("/{resource}", async (string resource, JsonElement input, IOperations operations, HttpContext context, CancellationToken ct) =>
{
    var record = await operations.Create(context.Actor(), resource, input, ct);
    context.Response.Headers.ETag = $"\"{record.Version}\"";
    context.Response.Headers.Location = $"/api/v1/{resource}/{record.Id}";
    return Results.Json<object>(record, statusCode: 201);
});
api.MapPut("/{resource}/{id:guid}", async (string resource, Guid id, JsonElement input, IOperations operations, HttpContext context, CancellationToken ct) =>
{
    var record = await operations.Update(context.Actor(), resource, id, ParseVersion(context), input, ct);
    context.Response.Headers.ETag = $"\"{record.Version}\"";
    return Results.Json<object>(record);
});
api.MapDelete("/{resource}/{id:guid}", async (string resource, Guid id, IOperations operations, HttpContext context, CancellationToken ct) =>
{
    await operations.Delete(context.Actor(), resource, id, ParseVersion(context), ct);
    return Results.NoContent();
});
app.Run();

static long ParseVersion(HttpContext context) => long.TryParse(context.Request.Headers.IfMatch.ToString().Trim('"'), out var version) && version > 0
    ? version : throw new AppException(428, "If-Match with the current quoted record version is required.");

static bool CanWrite(Actor actor, string resource)
{
    try { Permissions.Demand(actor, resource, true); return true; } catch (AppException) { return false; }
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
