using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<IdempotencyRecord> Idempotency => Set<IdempotencyRecord>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<PasswordReset> PasswordResets => Set<PasswordReset>();
    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
    public DbSet<ExternalIdentity> ExternalIdentities => Set<ExternalIdentity>();
    public DbSet<ExternalFlow> ExternalFlows => Set<ExternalFlow>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<ExternalIdentity>().HasKey(x => new { x.Provider, x.Subject });
        model.Entity<ExternalIdentity>().Property(x => x.Provider).HasMaxLength(20);
        model.Entity<ExternalIdentity>().Property(x => x.Subject).HasMaxLength(256);
        model.Entity<ExternalIdentity>().HasIndex(x => new { x.UserId, x.Provider }).IsUnique();
        model.Entity<ExternalIdentity>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<ExternalFlow>().HasKey(x => x.TokenHash);
        model.Entity<ExternalFlow>().Property(x => x.TokenHash).HasMaxLength(64);
        model.Entity<ExternalFlow>().Property(x => x.SessionHash).HasMaxLength(64);
        model.Entity<ExternalFlow>().Property(x => x.Purpose).HasMaxLength(20);
        model.Entity<ExternalFlow>().Property(x => x.Provider).HasMaxLength(20);
        model.Entity<ExternalFlow>().Property(x => x.Subject).HasMaxLength(256);
        model.Entity<ExternalFlow>().Property(x => x.Name).HasMaxLength(200);
        model.Entity<ExternalFlow>().Property(x => x.Email).HasMaxLength(254);
        model.Entity<ExternalFlow>().HasIndex(x => x.ExpiresAt);
        model.Entity<ExternalFlow>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<MailMessage>().ToTable("MailOutbox").HasKey(x => x.Id);
        model.Entity<MailMessage>().HasIndex(x => x.NextAttemptAt);
        model.Entity<RateBucket>().ToTable("RateBuckets").HasKey(x => x.Key);
        model.Entity<RateBucket>().HasIndex(x => x.ExpiresAt);
        model.Entity<Organization>().HasKey(x => x.Id);
        model.Entity<Organization>().Property(x => x.Name).HasMaxLength(200);
        model.Entity<Organization>().Property(x => x.Currency).HasMaxLength(3);
        model.Entity<User>().HasKey(x => x.Id);
        model.Entity<User>().HasIndex(x => x.Email).IsUnique();
        model.Entity<User>().HasIndex(x => x.OrganizationId);
        model.Entity<User>().Property(x => x.Version).IsConcurrencyToken();
        model.Entity<User>().Property(x => x.Email).HasMaxLength(254);
        model.Entity<User>().Property(x => x.Name).HasMaxLength(200);
        model.Entity<User>().HasOne<Organization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Session>().HasKey(x => x.TokenHash);
        model.Entity<Session>().Property(x => x.TokenHash).HasMaxLength(64);
        model.Entity<Session>().HasIndex(x => x.ExpiresAt);
        model.Entity<Session>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<PasswordReset>().HasKey(x => x.TokenHash);
        model.Entity<PasswordReset>().HasIndex(x => x.ExpiresAt);
        model.Entity<PasswordReset>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<IdempotencyRecord>().HasKey(x => new { x.Scope, x.Key });
        model.Entity<IdempotencyRecord>().Property(x => x.Scope).HasMaxLength(300);
        model.Entity<IdempotencyRecord>().Property(x => x.Key).HasMaxLength(128);
        model.Entity<IdempotencyRecord>().HasIndex(x => x.ExpiresAt);
        model.Entity<AuditEvent>().HasKey(x => x.Id);
        model.Entity<AuditEvent>().HasIndex(x => new { x.OrganizationId, x.CreatedAt, x.Id });

        Configure<Customer>(model, "Customers");
        Configure<Supplier>(model, "Suppliers");
        Configure<Driver>(model, "Drivers").HasIndex(x => new { x.OrganizationId, x.LicenseNumber }).IsUnique();
        Configure<Vehicle>(model, "Vehicles").HasIndex(x => new { x.OrganizationId, x.RegistrationNumber }).IsUnique();
        Configure<Booking>(model, "Bookings");
        Configure<Trip>(model, "Trips");
        Configure<Maintenance>(model, "Maintenance");
        Configure<FuelEntry>(model, "FuelEntries");
        Configure<Expense>(model, "Expenses");
        Configure<Income>(model, "Income");
        Configure<Invoice>(model, "Invoices");
        Configure<Payment>(model, "Payments");
        Configure<Document>(model, "Documents");
        Configure<Notification>(model, "Notifications");
        Configure<SupportTicket>(model, "SupportTickets");
        model.Entity<User>().HasOne<Driver>().WithMany().HasForeignKey(x => new { x.DriverId, x.OrganizationId })
            .HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<User>().HasIndex(x => new { x.OrganizationId, x.DriverId }).IsUnique().HasFilter("\"DriverId\" IS NOT NULL");

        model.Entity<Booking>().HasOne<Customer>().WithMany().HasForeignKey(x => new { x.CustomerId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Trip>().HasOne<Booking>().WithMany().HasForeignKey(x => new { x.BookingId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Trip>().HasOne<Vehicle>().WithMany().HasForeignKey(x => new { x.VehicleId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Trip>().HasOne<Driver>().WithMany().HasForeignKey(x => new { x.DriverId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Maintenance>().HasOne<Vehicle>().WithMany().HasForeignKey(x => new { x.VehicleId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<FuelEntry>().HasOne<Vehicle>().WithMany().HasForeignKey(x => new { x.VehicleId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<FuelEntry>().HasOne<Trip>().WithMany().HasForeignKey(x => new { x.TripId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Expense>().HasOne<Vehicle>().WithMany().HasForeignKey(x => new { x.VehicleId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Expense>().HasOne<Trip>().WithMany().HasForeignKey(x => new { x.TripId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Income>().HasOne<Trip>().WithMany().HasForeignKey(x => new { x.TripId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Invoice>().HasOne<Customer>().WithMany().HasForeignKey(x => new { x.CustomerId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Invoice>().HasOne<Trip>().WithMany().HasForeignKey(x => new { x.TripId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Payment>().HasOne<Invoice>().WithMany().HasForeignKey(x => new { x.InvoiceId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Document>().HasOne<Vehicle>().WithMany().HasForeignKey(x => new { x.VehicleId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Document>().HasOne<Driver>().WithMany().HasForeignKey(x => new { x.DriverId, x.OrganizationId }).HasPrincipalKey(x => new { x.Id, x.OrganizationId }).OnDelete(DeleteBehavior.Restrict);
        model.Entity<Trip>().HasIndex(x => new { x.OrganizationId, x.VehicleId, x.StartsAt });
        model.Entity<Trip>().HasIndex(x => new { x.OrganizationId, x.DriverId, x.StartsAt });
        model.Entity<Booking>().HasIndex(x => new { x.OrganizationId, x.ScheduledDate });
        model.Entity<Payment>().HasIndex(x => new { x.OrganizationId, x.InvoiceId });
        foreach (var entity in model.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType == typeof(decimal)) { property.SetPrecision(18); property.SetScale(2); }
            }
    }

    private static EntityTypeBuilder<T> Configure<T>(ModelBuilder model, string table) where T : Record
    {
        var entity = model.Entity<T>();
        entity.HasBaseType((Type?)null);
        entity.ToTable(table);
        foreach (var property in typeof(T).GetProperties().Where(x => x.PropertyType == typeof(decimal)))
            entity.ToTable(table, options => options.HasCheckConstraint($"CK_{table}_{property.Name}_Nonnegative", $"\"{property.Name}\" >= 0"));
        if (typeof(T) == typeof(Trip)) entity.ToTable(table, options => options.HasCheckConstraint("CK_Trips_Interval", "\"EndsAt\" > \"StartsAt\""));
        entity.HasKey(x => x.Id);
        entity.HasAlternateKey(x => new { x.Id, x.OrganizationId });
        entity.HasOne<Organization>().WithMany().HasForeignKey(x => x.OrganizationId).OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex(x => new { x.OrganizationId, x.Reference }).IsUnique();
        entity.HasIndex(x => new { x.OrganizationId, x.CreatedAt, x.Id });
        entity.HasIndex(x => new { x.OrganizationId, x.Status, x.CreatedAt, x.Id });
        entity.Property(x => x.Name).HasMaxLength(200);
        entity.Property(x => x.Reference).HasMaxLength(200);
        entity.Property(x => x.Status).HasMaxLength(40);
        entity.Property(x => x.Notes).HasMaxLength(4000);
        entity.Property(x => x.Version).IsConcurrencyToken();
        return entity;
    }
}
