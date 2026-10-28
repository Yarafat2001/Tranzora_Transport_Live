using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Npgsql;
using Tranzora.Application;
using Tranzora.Domain;
using Tranzora.Infrastructure;

namespace Tranzora.Api;

public sealed class ApiErrors(RequestDelegate next, ILogger<ApiErrors> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try { await next(context); }
        catch (Exception ex) when (!context.Response.HasStarted && ex is not OperationCanceledException)
        {
            var postgres = ex as PostgresException ?? ex.InnerException as PostgresException;
            var (status, message) = ex switch
            {
                AppException app => (app.Status, app.Message),
                BadHttpRequestException => (400, "Invalid request."),
                System.Text.Json.JsonException => (400, "Invalid JSON request."),
                DbUpdateConcurrencyException => (412, "The record changed. Reload it before retrying."),
                _ when postgres?.SqlState == "23505" => (409, "A record with this email, reference, registration, or license already exists."),
                _ when postgres?.SqlState is "23503" or "23001" => (409, "The record is referenced by another record, or the related record does not exist."),
                _ when postgres?.SqlState is "23P01" or "23514" => (409, "The operation violates a scheduling or data integrity rule."),
                _ when postgres?.SqlState is "40001" or "40P01" or "55P03" => (409, "Concurrent operation. Retry with the same Idempotency-Key."),
                _ when ex is NpgsqlException || ex.InnerException is NpgsqlException => (503, "Database temporarily unavailable."),
                _ => (500, "An unexpected error occurred.")
            };
            if (status >= 500) logger.LogError(ex, "API failure {TraceId}", context.TraceIdentifier);
            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.Headers.CacheControl = "no-store";
            if (status == 503) context.Response.Headers.RetryAfter = "5";
            if (status == 429) context.Response.Headers.RetryAfter = (60 - DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 60).ToString();
            await context.Response.WriteAsJsonAsync(new { type = $"https://httpstatuses.com/{status}", title = message, status, detail = message, error = message, traceId = context.TraceIdentifier }, context.RequestAborted);
        }
    }
}

public sealed class RequestSecurity(RequestDelegate next, IConfiguration config)
{
    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["X-Request-Id"] = context.TraceIdentifier;
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers.CacheControl = "no-store";
        if (context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE")
        {
            if (context.Request.Headers["X-Tranzora-Request"] != "1") throw new AppException(403, "The X-Tranzora-Request header is required.");
            var origin = context.Request.Headers.Origin.ToString();
            var allowedOrigins = WebSecurity.Origins(config);
            if (origin.Length > 0 && !allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) throw new AppException(403, "Origin is not allowed.");
            if (context.Request.ContentLength > 65536) throw new AppException(413, "Request body exceeds 64 KiB.");
            if (context.Request.Method != "DELETE" && !context.Request.HasJsonContentType()) throw new AppException(415, "Use application/json.");
        }
        await next(context);
    }
}

// Atomic PostgreSQL buckets apply across every API replica (including login attempts).
public sealed class SharedRateLimit(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (context.Request.Path.StartsWithSegments("/health")) { await next(context); return; }
        var authenticated = context.User.Identity?.IsAuthenticated == true;
        var identity = authenticated ? context.Actor().UserId.ToString() : context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var window = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        var key = Tranzora.Infrastructure.Authentication.Hash($"{identity}:{window}:{(authenticated ? "user" : "anonymous")}");
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(context.RequestAborted);
        await using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO \"RateBuckets\" (\"Key\", \"Count\", \"ExpiresAt\") VALUES (@key, 1, now() + interval '2 minutes') ON CONFLICT (\"Key\") DO UPDATE SET \"Count\" = \"RateBuckets\".\"Count\" + 1 RETURNING \"Count\"";
        var parameter = command.CreateParameter(); parameter.ParameterName = "key"; parameter.Value = key; command.Parameters.Add(parameter);
        var count = (int)(await command.ExecuteScalarAsync(context.RequestAborted))!;
        if (count > (authenticated ? 180 : 30))
        {
            context.Response.Headers.RetryAfter = (60 - DateTimeOffset.UtcNow.ToUnixTimeSeconds() % 60).ToString();
            throw new AppException(429, "Too many requests. Retry after the indicated delay.");
        }
        await next(context);
    }
}

// Buffer the HTTP response until the mutation, audit, revision and replay result commit together.
public sealed class TransactionalRequests(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (!context.Request.Path.StartsWithSegments("/api/v1") || context.Request.Method is not ("POST" or "PUT" or "PATCH" or "DELETE") || context.User.Identity?.IsAuthenticated != true)
        { await next(context); return; }
        var actor = context.Actor();
        var resource = context.Request.Path.Value!.Split('/', StringSplitOptions.RemoveEmptyEntries).ElementAtOrDefault(2) ?? "";
        if (resource is not "profile" and not "password") Permissions.Demand(actor, resource, true);
        var key = context.Request.Headers["Idempotency-Key"].ToString();
        if (key.Length is < 8 or > 128 || key.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_'))
            throw new AppException(400, "An Idempotency-Key of 8–128 letters, digits, hyphens or underscores is required.");
        context.Request.EnableBuffering();
        using var reader = new StreamReader(context.Request.Body, Encoding.UTF8, leaveOpen: true);
        var body = await reader.ReadToEndAsync(context.RequestAborted);
        if (Encoding.UTF8.GetByteCount(body) > 65536) throw new AppException(413, "Request body exceeds 64 KiB.");
        context.Request.Body.Position = 0;
        var scope = $"{actor.OrganizationId}:{actor.UserId}:{context.Request.Method}:{context.Request.Path}";
        var hash = Tranzora.Infrastructure.Authentication.Hash($"{context.Request.QueryString}\n{context.Request.Headers.IfMatch}\n{body}");
        await using var tx = await db.Database.BeginTransactionAsync(context.RequestAborted);
        await db.Database.ExecuteSqlRawAsync("SET LOCAL lock_timeout = '5s'", context.RequestAborted);
        // Tenant lock also serializes balance checks and overlapping assignments across API instances.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Organizations\" WHERE \"Id\" = {actor.OrganizationId} FOR UPDATE", context.RequestAborted);
        var existing = await db.Idempotency.SingleOrDefaultAsync(x => x.Scope == scope && x.Key == key, context.RequestAborted);
        if (existing is not null && existing.ExpiresAt > DateTimeOffset.UtcNow)
        {
            if (existing.RequestHash != hash) throw new AppException(409, "This Idempotency-Key was already used for a different request.");
            context.Response.StatusCode = existing.StatusCode;
            context.Response.ContentType = "application/json";
            context.Response.Headers["Idempotency-Replayed"] = "true";
            if (existing.ETag is not null) context.Response.Headers.ETag = existing.ETag;
            if (existing.Location is not null) context.Response.Headers.Location = existing.Location;
            await tx.CommitAsync(context.RequestAborted);
            await context.Response.WriteAsync(existing.ResponseBody, context.RequestAborted);
            return;
        }
        if (existing is not null) { db.Remove(existing); await db.SaveChangesAsync(context.RequestAborted); }
        var original = context.Response.Body;
        await using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next(context);
            if (context.Response.StatusCode < 400)
            {
                buffer.Position = 0;
                var response = await new StreamReader(buffer, leaveOpen: true).ReadToEndAsync(context.RequestAborted);
                db.Idempotency.Add(new IdempotencyRecord { Scope = scope, Key = key, RequestHash = hash, StatusCode = context.Response.StatusCode, ResponseBody = response, ETag = context.Response.Headers.ETag.FirstOrDefault(), Location = context.Response.Headers.Location.FirstOrDefault(), ExpiresAt = DateTimeOffset.UtcNow.AddHours(24) });
                await db.Organizations.Where(x => x.Id == actor.OrganizationId).ExecuteUpdateAsync(set => set.SetProperty(x => x.Revision, x => x.Revision + 1), context.RequestAborted);
                await db.SaveChangesAsync(context.RequestAborted);
                await tx.CommitAsync(context.RequestAborted);
            }
            else await tx.RollbackAsync(context.RequestAborted);
            context.Response.Body = original;
            buffer.Position = 0;
            await buffer.CopyToAsync(original, context.RequestAborted);
        }
        finally { context.Response.Body = original; }
    }
}

public sealed class ReadCache(IDistributedCache cache, AppDbContext db, ILogger<ReadCache> logger)
{
    public async Task<string> Get(Actor actor, string requestKey, Func<Task<object>> load, CancellationToken ct)
    {
        var revision = await db.Organizations.AsNoTracking().Where(x => x.Id == actor.OrganizationId).Select(x => x.Revision).SingleAsync(ct);
        var key = $"tranzora:v1:{actor.OrganizationId}:{actor.Role}:{revision}:{Tranzora.Infrastructure.Authentication.Hash(requestKey)}";
        try { var hit = await cache.GetStringAsync(key, ct); if (hit is not null) return hit; }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogWarning("Read cache unavailable; loading database"); }
        var value = System.Text.Json.JsonSerializer.Serialize(await load(), new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web));
        try { await cache.SetStringAsync(key, value, new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30) }, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogWarning("Read cache write unavailable"); }
        return value;
    }
}
