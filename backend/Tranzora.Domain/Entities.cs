namespace Tranzora.Domain;

public sealed class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Currency { get; set; } = "BDT";
    public long Revision { get; set; }
}

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Super Admin";
    public Guid? DriverId { get; set; }
    public bool Active { get; set; } = true;
    public int FailedLogins { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset? LockedUntil { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Session
{
    public string TokenHash { get; set; } = "";
    public Guid UserId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

// Shared metadata; each concrete entity is mapped to its own relational table.
public abstract class Record
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public string Name { get; set; } = "";
    public string Reference { get; set; } = "";
    public string Status { get; set; } = "Active";
    public string Notes { get; set; } = "";
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
public sealed class Customer : Record { public string Email { get; set; } = ""; public string Phone { get; set; } = ""; public string Address { get; set; } = ""; }
public sealed class Supplier : Record { public string Email { get; set; } = ""; public string Phone { get; set; } = ""; public string Address { get; set; } = ""; }
public sealed class Driver : Record { public string Phone { get; set; } = ""; public string LicenseNumber { get; set; } = ""; public DateOnly LicenseExpiry { get; set; } }
public sealed class Vehicle : Record { public string RegistrationNumber { get; set; } = ""; public string VehicleType { get; set; } = ""; public decimal Capacity { get; set; } public decimal Odometer { get; set; } }
public sealed class Booking : Record { public Guid CustomerId { get; set; } public string Origin { get; set; } = ""; public string Destination { get; set; } = ""; public decimal Amount { get; set; } public DateOnly ScheduledDate { get; set; } }
public sealed class Trip : Record { public Guid BookingId { get; set; } public Guid VehicleId { get; set; } public Guid DriverId { get; set; } public DateTimeOffset StartsAt { get; set; } public DateTimeOffset EndsAt { get; set; } }
public sealed class Maintenance : Record { public Guid VehicleId { get; set; } public DateOnly ScheduledDate { get; set; } public decimal Amount { get; set; } }
public sealed class FuelEntry : Record { public Guid VehicleId { get; set; } public Guid? TripId { get; set; } public decimal Liters { get; set; } public decimal UnitPrice { get; set; } public DateOnly RecordDate { get; set; } }
public sealed class Expense : Record { public Guid? TripId { get; set; } public Guid? VehicleId { get; set; } public decimal Amount { get; set; } public string Category { get; set; } = ""; public DateOnly RecordDate { get; set; } }
public sealed class Income : Record { public Guid? TripId { get; set; } public decimal Amount { get; set; } public string Category { get; set; } = ""; public DateOnly RecordDate { get; set; } }
public sealed class Invoice : Record { public Guid CustomerId { get; set; } public Guid? TripId { get; set; } public decimal Amount { get; set; } public DateOnly DueDate { get; set; } }
public sealed class Payment : Record { public Guid InvoiceId { get; set; } public decimal Amount { get; set; } public string Method { get; set; } = ""; public DateOnly RecordDate { get; set; } }
public sealed class Document : Record { public Guid? VehicleId { get; set; } public Guid? DriverId { get; set; } public string StorageKey { get; set; } = ""; public DateOnly? ExpiresOn { get; set; } }
public sealed class Notification : Record { public bool Read { get; set; } }
public sealed class SupportTicket : Record { public string Message { get; set; } = ""; }

public sealed class AuditEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }
    public Guid UserId { get; set; }
    public string Action { get; set; } = "";
    public string Resource { get; set; } = "";
    public Guid RecordId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class IdempotencyRecord
{
    public string Scope { get; set; } = "";
    public string Key { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public int StatusCode { get; set; }
    public string ResponseBody { get; set; } = "";
    public string? ETag { get; set; }
    public string? Location { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}

public sealed class PasswordReset
{
    public string TokenHash { get; set; } = "";
    public Guid UserId { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
}
