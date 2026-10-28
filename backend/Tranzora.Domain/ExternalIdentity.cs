namespace Tranzora.Domain;

public sealed class ExternalIdentity
{
    public string Provider { get; set; } = "";
    public string Subject { get; set; } = "";
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastUsedAt { get; set; } = DateTimeOffset.UtcNow;
}

// Only opaque token hashes are persisted. Link intents are tied to the initiating
// database session; enrollment grants cannot authenticate an existing account.
public sealed class ExternalFlow
{
    public string TokenHash { get; set; } = "";
    public string Purpose { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public Guid? UserId { get; set; }
    public string? SessionHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
