using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Tranzora.Infrastructure;

// Durable email outbox: SMTP delivery is at least once, independent of HTTP requests.
public sealed class MailMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class RateBucket
{
    public string Key { get; set; } = "";
    public int Count { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
public sealed class BackgroundMaintenance(IServiceScopeFactory scopes, IConfiguration config, ILogger<BackgroundMaintenance> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var now = DateTimeOffset.UtcNow;
                await db.Sessions.Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(stoppingToken);
                await db.PasswordResets.Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(stoppingToken);
                await db.ExternalFlows.Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(stoppingToken);
                await db.Idempotency.Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(stoppingToken);
                await db.Set<RateBucket>().Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(stoppingToken);
                if (string.IsNullOrWhiteSpace(config["Smtp:Host"])) continue;
                await using var tx = await db.Database.BeginTransactionAsync(stoppingToken);
                var mail = await db.Set<MailMessage>().FromSqlRaw("SELECT * FROM \"MailOutbox\" WHERE \"NextAttemptAt\" <= now() AND \"Attempts\" < 8 ORDER BY \"NextAttemptAt\" FOR UPDATE SKIP LOCKED LIMIT 1").FirstOrDefaultAsync(stoppingToken);
                if (mail is not null)
                {
                    try
                    {
                        using var client = new System.Net.Mail.SmtpClient(config["Smtp:Host"], config.GetValue("Smtp:Port", 587)) { EnableSsl = config.GetValue("Smtp:EnableSsl", true), Timeout = 10000 };
                        if (!string.IsNullOrWhiteSpace(config["Smtp:Username"])) client.Credentials = new System.Net.NetworkCredential(config["Smtp:Username"], config["Smtp:Password"]);
                        using var message = new System.Net.Mail.MailMessage(config["Smtp:From"]!, mail.Recipient, mail.Subject, mail.Body);
                        await client.SendMailAsync(message, stoppingToken);
                        db.Remove(mail);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        mail.Attempts++;
                        mail.NextAttemptAt = now.AddSeconds(Math.Pow(2, mail.Attempts) * 30);
                        logger.LogWarning("Email delivery failed for outbox item {Id}, attempt {Attempt}", mail.Id, mail.Attempts);
                    }
                    await db.SaveChangesAsync(stoppingToken);
                }
                await tx.CommitAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogError(ex, "Background maintenance failed"); }
        }
    }
}
