using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Tranzora.Application;
using Tranzora.Domain;
using Tranzora.Infrastructure;

namespace Tranzora.Api;

public static class EndpointExtensions
{
    public static void MapAuthEndpoints(this RouteGroupBuilder auth, IConfiguration config)
    {
        auth.MapPost("/register", async (RegisterInput input, IAuthentication authentication, HttpContext context, CancellationToken ct) =>
        {
            var result = await authentication.Register(input, ct);
            context.Response.Cookies.Append(WebSecurity.SessionCookieName, result.Token, WebSecurity.SessionCookieOptions(config));
            return Results.Json(new { user = result.User }, statusCode: 201);
        });

        auth.MapPost("/login", async (LoginInput input, IAuthentication authentication, HttpContext context, CancellationToken ct) =>
        {
            var result = await authentication.Login(input, ct);
            context.Response.Cookies.Append(WebSecurity.SessionCookieName, result.Token, WebSecurity.SessionCookieOptions(config));
            return Results.Ok(new { user = result.User });
        });

        auth.MapGet("/session", async (IAuthentication authentication, HttpContext context, CancellationToken ct) =>
        {
            var user = await authentication.Session(context.Request.Cookies[WebSecurity.SessionCookieName] ?? "", ct);
            return user is null ? Results.Json(new { user = (object?)null }, statusCode: 401) : Results.Ok(new { user });
        });

        auth.MapPost("/logout", async (IAuthentication authentication, HttpContext context, CancellationToken ct) =>
        {
            await authentication.Logout(context.Request.Cookies[WebSecurity.SessionCookieName] ?? "", ct);
            context.Response.Cookies.Delete(WebSecurity.SessionCookieName, WebSecurity.SessionCookieOptions(config));
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

        auth.MapExternalSignIn(config);
    }

    public static void MapAccountEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/profile", async (AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            var actor = context.Actor();
            return Results.Ok(await db.Users.Where(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId)
                .Select(x => new { x.Id, x.Name, x.Email, x.Phone, x.Role, x.Version }).SingleAsync(ct));
        });

        api.MapPut("/profile", async (ProfileInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200 || input.Phone?.Length > 40)
                throw new AppException(400, "A name and valid phone are required.");

            var actor = context.Actor();
            var user = await db.Users.SingleAsync(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId, ct);
            if (user.Version != ParseVersion(context)) throw new AppException(412, "Profile changed. Reload before editing.");

            user.Name = input.Name.Trim();
            user.Phone = input.Phone ?? "";
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
            return Results.Ok(await db.Organizations.Where(x => x.Id == context.Actor().OrganizationId)
                .Select(x => new { x.Name, x.Currency, version = x.Revision }).SingleAsync(ct));
        });

        api.MapPut("/settings", async (WorkspaceInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            var actor = context.Actor();
            Permissions.Demand(actor, "settings", true);
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200)
                throw new AppException(400, "Workspace name is required.");

            var organization = await db.Organizations.SingleAsync(x => x.Id == actor.OrganizationId, ct);
            if (organization.Revision != input.Version) throw new AppException(412, "Workspace changed. Reload before saving.");

            organization.Name = input.Name.Trim();
            db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Resource = "settings", Action = "update", RecordId = organization.Id });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { organization.Name, organization.Currency, version = organization.Revision + 1 });
        });
    }
    public static void MapUserEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/users", async ([AsParameters] PageParameters parameters, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            Permissions.Demand(context.Actor(), "users", false);
            var query = parameters.ToQuery();
            Operations.ValidatePage(query);
            var rows = db.Users.AsNoTracking().Where(x => x.OrganizationId == context.Actor().OrganizationId);
            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var search = query.Search.ToLower();
                rows = rows.Where(x => x.Name.ToLower().Contains(search) || x.Email.Contains(search));
            }
            var total = await rows.LongCountAsync(ct);
            var items = await rows.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id)
                .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
                .Select(x => new { x.Id, x.Name, x.Email, x.Phone, x.Role, x.DriverId, x.Version, status = x.Active ? "Active" : "Inactive" })
                .ToArrayAsync(ct);
            return Results.Ok(new PageResult(items.Cast<object>().ToArray(), query.Page, query.PageSize, total));
        });

        api.MapPost("/users", async (CreateUserInput input, AppDbContext db, IPasswordHasher<User> hasher, HttpContext context, CancellationToken ct) =>
        {
            var actor = context.Actor();
            Permissions.Demand(actor, "users", true);
            Tranzora.Infrastructure.Authentication.ValidatePassword(input.Password);
            if (!Permissions.Roles.Contains(input.Role) || string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 200)
                throw new AppException(400, "Name and a valid role are required.");
            if (input.DriverId.HasValue && (input.Role != "Driver" || !await db.Set<Driver>().AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id == input.DriverId, ct)))
                throw new AppException(422, "Select a driver in this organization for a Driver account.");

            var user = new User
            {
                OrganizationId = actor.OrganizationId,
                Name = input.Name.Trim(),
                Email = Tranzora.Infrastructure.Authentication.NormalizeEmail(input.Email),
                Phone = input.Phone ?? "",
                Role = input.Role
            };
            user.PasswordHash = hasher.HashPassword(user, input.Password);
            user.DriverId = input.DriverId;
            db.Users.Add(user);
            db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = "create", Resource = "users", RecordId = user.Id });
            await db.SaveChangesAsync(ct);
            return Results.Json(new { user.Id, user.Name, user.Email, user.Role, user.Version }, statusCode: 201);
        });

        api.MapPut("/users/{id:guid}", async (Guid id, UpdateUserInput input, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            var actor = context.Actor();
            Permissions.Demand(actor, "users", true);
            if (!Permissions.Roles.Contains(input.Role)) throw new AppException(400, "Invalid role.");
            if (input.DriverId.HasValue && (input.Role != "Driver" || !await db.Set<Driver>().AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id == input.DriverId, ct)))
                throw new AppException(422, "Select a driver in this organization for a Driver account.");
            if (id == actor.UserId) throw new AppException(409, "You cannot change your own role or deactivate your own account.");

            var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id && x.OrganizationId == actor.OrganizationId, ct) ?? throw new AppException(404, "User not found.");
            if (user.Version != ParseVersion(context)) throw new AppException(412, "User changed. Reload before editing.");

            if (user.Role == "Super Admin" && (input.Role != "Super Admin" || !input.Active) &&
                !await db.Users.AnyAsync(x => x.OrganizationId == actor.OrganizationId && x.Id != id && x.Role == "Super Admin" && x.Active, ct))
            {
                throw new AppException(409, "At least one active Super Admin is required.");
            }

            user.Role = input.Role;
            user.Active = input.Active;
            user.DriverId = input.DriverId;
            user.Version++;
            await db.Sessions.Where(x => x.UserId == id).ExecuteDeleteAsync(ct);
            db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = "update", Resource = "users", RecordId = id });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { user.Id, user.Name, user.Email, user.Role, user.Active, user.Version });
        });
    }

    public static void MapResourceEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/dashboard", async (IOperations operations, ReadCache cache, HttpContext context, CancellationToken ct) =>
        {
            Permissions.Demand(context.Actor(), "dashboard", false);
            var json = await cache.Get(context.Actor(), "dashboard", () => operations.Dashboard(context.Actor(), ct), ct);
            return Results.Content(json, "application/json");
        });
        api.MapGet("/audit-logs", async ([AsParameters] PageParameters query, IOperations operations, HttpContext context, CancellationToken ct) =>
            Results.Ok(await operations.Audit(context.Actor(), query.ToQuery(), ct)));
        api.MapGet("/{resource}", async (string resource, [AsParameters] PageParameters query, IOperations operations, ReadCache cache, HttpContext context, CancellationToken ct) =>
        {
            Permissions.Demand(context.Actor(), resource, false);
            var pageQuery = query.ToQuery();
            Operations.ValidatePage(pageQuery);
            var json = await cache.Get(context.Actor(), $"{resource}:{context.Request.QueryString}", async () => await operations.List(context.Actor(), resource, pageQuery, ct), ct);
            return Results.Content(json, "application/json");
        });

        api.MapGet("/{resource}/{id:guid}", async (string resource, Guid id, IOperations operations, HttpContext context, CancellationToken ct) =>
        {
            var record = await operations.Get(context.Actor(), resource, id, ct);
            context.Response.Headers.ETag = $"\"{record.Version}\"";
            return Results.Json(record);
        });

        api.MapPost("/{resource}", async (string resource, JsonElement input, IOperations operations, HttpContext context, CancellationToken ct) =>
        {
            var record = await operations.Create(context.Actor(), resource, input, ct);
            context.Response.Headers.ETag = $"\"{record.Version}\"";
            context.Response.Headers.Location = $"/api/v1/{resource}/{record.Id}";
            return Results.Json(record, statusCode: 201);
        });

        api.MapPut("/{resource}/{id:guid}", async (string resource, Guid id, JsonElement input, IOperations operations, HttpContext context, CancellationToken ct) =>
        {
            var record = await operations.Update(context.Actor(), resource, id, ParseVersion(context), input, ct);
            context.Response.Headers.ETag = $"\"{record.Version}\"";
            return Results.Json(record);
        });

        api.MapDelete("/{resource}/{id:guid}", async (string resource, Guid id, IOperations operations, HttpContext context, CancellationToken ct) =>
        {
            await operations.Delete(context.Actor(), resource, id, ParseVersion(context), ct);
            return Results.NoContent();
        });
    }

    internal static long ParseVersion(HttpContext context) => long.TryParse(context.Request.Headers.IfMatch.ToString().Trim('"'), out var version) && version > 0
        ? version : throw new AppException(428, "If-Match with the current quoted record version is required.");

    internal static bool CanWrite(Actor actor, string resource)
    {
        try { Permissions.Demand(actor, resource, true); return true; } catch (AppException) { return false; }
    }
}