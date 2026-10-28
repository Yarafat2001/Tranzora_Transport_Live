using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Tranzora.Application;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed record DemoAccount(string Role, string Email);
public sealed record DemoSeedResult(Guid OrganizationId, string OrganizationName, int CreatedUsers, int CreatedRecords,
    int PreservedRecords, IReadOnlyList<DemoAccount> Accounts, object Dashboard);

/// <summary>Explicit development fixtures, created through the operational use cases in one transaction.</summary>
public sealed class DemoSeeder(AppDbContext db, IOperations operations, IPasswordHasher<User> hasher, IHostEnvironment environment)
{
    public static readonly Guid OrganizationId = Guid.Parse("d368724b-c112-4b79-b865-a5b45cfb6982");
    public const string DefaultPassword = "TranzoraDemo2026!";
    public static readonly DemoAccount[] Accounts =
    [
        new("Super Admin", "superadmin@demo.tranzora.test"),
        new("Business Admin", "admin@demo.tranzora.test"),
        new("Manager", "manager@demo.tranzora.test"),
        new("Accountant", "accountant@demo.tranzora.test"),
        new("Dispatcher", "dispatcher@demo.tranzora.test"),
        new("Driver", "driver@demo.tranzora.test"),
        new("Support Staff", "support@demo.tranzora.test"),
        new("Viewer", "viewer@demo.tranzora.test")
    ];
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private int createdRecords;
    private int preservedRecords;
    private Actor actor = null!;

    public async Task<DemoSeedResult> Seed(CancellationToken ct = default)
    {
        createdRecords = 0;
        preservedRecords = 0;
        if (!environment.IsDevelopment()) throw new InvalidOperationException("Demo seeding is allowed only in Development. It never runs automatically at API startup.");
        if ((await db.Database.GetPendingMigrationsAsync(ct)).Any()) throw new InvalidOperationException("Apply database migrations with --migrate before seeding.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Serialize two simultaneous seed commands, including the first organization insert.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(784296115032)", ct);
        var organization = await db.Organizations.SingleOrDefaultAsync(x => x.Id == OrganizationId, ct);
        if (organization is null)
        {
            organization = new Organization { Id = OrganizationId, Name = "Tranzora Demo Logistics", Currency = "BDT" };
            db.Organizations.Add(organization);
            await db.SaveChangesAsync(ct);
        }
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Organizations\" WHERE \"Id\" = {OrganizationId} FOR UPDATE", ct);
        var createdUsers = 0;
        var linkedDriverAccount = false;
        foreach (var (account, index) in Accounts.Select((account, index) => (account, index)))
        {
            var user = await db.Users.SingleOrDefaultAsync(x => x.Email == account.Email, ct);
            if (user is not null)
            {
                if (user.OrganizationId != OrganizationId) throw new InvalidOperationException($"Demo email {account.Email} belongs to a different workspace; seeding cancelled.");
                continue; // Preserve passwords, roles, account status and profile changes on reruns.
            }
            user = new User
            {
                OrganizationId = OrganizationId,
                Name = $"Demo {account.Role}",
                Email = account.Email,
                Phone = $"+88017000000{index:00}",
                Role = account.Role
            };
            user.PasswordHash = hasher.HashPassword(user, DefaultPassword);
            db.Users.Add(user);
            createdUsers++;
        }
        await db.SaveChangesAsync(ct);
        var owner = await db.Users.SingleAsync(x => x.Email == Accounts[0].Email, ct);
        actor = new(owner.Id, OrganizationId, "Super Admin");
        var now = DateTimeOffset.UtcNow;
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var customers = new List<Customer>();
        string[] customerNames = ["Padma Textiles", "Meghna Foods", "Jamuna Steel", "Surma Electronics", "Karnaphuli Trading", "Rupsha Agro", "Bengal Packaging", "Eastern Ceramics", "Delta Pharmaceuticals", "Northern Furniture", "Green Valley Produce", "Legacy Trading"];
        for (var i = 0; i < customerNames.Length; i++)
            customers.Add(await Ensure<Customer>("customers", $"DEMO-CUS-{i + 1:000}", new
            {
                name = customerNames[i],
                phone = $"+88017100000{i:00}",
                email = $"customer{i + 1}@demo.tranzora.test",
                address = $"{i + 10} Commercial Road, Dhaka, Bangladesh",
                status = i == 11 ? "Inactive" : "Active"
            }, ct));
        string[] supplierNames = ["Demo Fleet Parts", "Demo Tire House", "Demo Workshop", "Demo Logistics Supplies"];
        for (var i = 0; i < supplierNames.Length; i++)
            await Ensure<Supplier>("suppliers", $"DEMO-SUP-{i + 1:000}", new
            {
                name = supplierNames[i],
                phone = $"+88017200000{i:00}",
                email = $"supplier{i + 1}@demo.tranzora.test",
                address = "Tejgaon Industrial Area, Dhaka",
                status = i == 3 ? "Inactive" : "Active"
            }, ct);

        var drivers = new List<Driver>();
        string[] driverNames = ["Arif Rahman", "Rafiq Ahmed", "Mehedi Hasan", "Kamal Hossain", "Sajjad Ali", "Imran Kabir"];
        for (var i = 0; i < driverNames.Length; i++)
            drivers.Add(await Ensure<Driver>("drivers", $"DEMO-DRV-{i + 1:000}", new
            {
                name = driverNames[i],
                phone = $"+88017300000{i:00}",
                licenseNumber = $"DEMO-DL-{i + 1:0000}",
                licenseExpiry = today.AddYears(3),
                status = i == 5 ? "Inactive" : "Active"
            }, ct));
        var vehicles = new List<Vehicle>();
        var demoDriver = await db.Users.SingleAsync(x => x.OrganizationId == OrganizationId && x.Email == "driver@demo.tranzora.test", ct);
        if (demoDriver.DriverId is null)
        {
            demoDriver.DriverId = drivers[1].Id;
            demoDriver.Version++;
            linkedDriverAccount = true;
            await db.SaveChangesAsync(ct);
        }
        for (var i = 0; i < 8; i++)
            vehicles.Add(await Ensure<Vehicle>("vehicles", $"DEMO-VEH-{i + 1:000}", new
            {
                name = $"Demo {new[] { "Covered Van", "Truck", "Mini Truck", "Bus" }[i % 4]} {i + 1}",
                registrationNumber = $"DEMO-DHA-{1100 + i}",
                vehicleType = new[] { "Covered Van", "Truck", "Mini Truck", "Bus" }[i % 4],
                capacity = new[] { 12, 10, 3, 40 }[i % 4],
                odometer = 24000 + i * 7500,
                status = i == 6 ? "Maintenance" : i == 7 ? "Inactive" : "Active"
            }, ct));

        string[] cities = ["Chattogram", "Sylhet", "Khulna", "Rajshahi", "Cumilla", "Rangpur"];
        var bookings = new List<Booking>();
        var starts = new List<DateTimeOffset>();
        for (var i = 0; i < 18; i++)
        {
            var start = i < 6 ? new DateTimeOffset(today.AddDays(-(6 - i) * 2).ToDateTime(new TimeOnly(6, 0), DateTimeKind.Utc))
                : i < 8 ? now.AddHours(-3) : new DateTimeOffset(today.AddDays(i - 7).ToDateTime(new TimeOnly(6, 0), DateTimeKind.Utc));
            starts.Add(start);
            bookings.Add(await Ensure<Booking>("bookings", $"DEMO-BKG-{i + 1:000}", new
            {
                name = $"Dhaka to {cities[i % cities.Length]} delivery {i + 1}",
                customerId = customers[i % 10].Id,
                origin = "Dhaka",
                destination = cities[i % cities.Length],
                amount = 20000 + i * 2500,
                scheduledDate = DateOnly.FromDateTime(start.UtcDateTime),
                status = i < 6 ? "Completed" : i < 12 ? "Confirmed" : i < 15 ? "Pending" : i < 17 ? "Cancelled" : "Confirmed"
            }, ct));
        }
        var trips = new List<Trip>();
        for (var i = 0; i < 12; i++)
            trips.Add(await Ensure<Trip>("trips", $"DEMO-TRP-{i + 1:000}", new
            {
                name = bookings[i].Name,
                bookingId = bookings[i].Id,
                vehicleId = vehicles[i % 6].Id,
                driverId = drivers[i % 5].Id,
                startsAt = starts[i],
                endsAt = starts[i].AddHours(8),
                status = i < 6 ? "Completed" : i < 8 ? "InProgress" : "Scheduled"
            }, ct));

        var invoices = new List<Invoice>();
        for (var i = 0; i < 10; i++)
            invoices.Add(await Ensure<Invoice>("invoices", $"DEMO-INV-{i + 1:000}", new
            {
                name = $"Freight invoice for {bookings[i].Reference}",
                customerId = bookings[i].CustomerId,
                tripId = trips[i].Id,
                amount = bookings[i].Amount,
                dueDate = today.AddDays(i < 4 ? -5 + i : 7 + i),
                status = i < 8 ? "Issued" : i == 8 ? "Draft" : "Cancelled"
            }, ct));
        int[] paymentInvoices = [0, 0, 1, 2, 3, 4, 5, 6];
        for (var i = 0; i < paymentInvoices.Length; i++)
        {
            var invoiceIndex = paymentInvoices[i];
            var invoice = invoices[invoiceIndex];
            await Ensure<Payment>("payments", $"DEMO-PAY-{i + 1:000}", new
            {
                name = $"Receipt {i + 1} for {invoice.Reference}",
                invoiceId = invoice.Id,
                amount = invoiceIndex is 1 or 3 or 5 ? invoice.Amount : invoice.Amount / 2,
                method = new[] { "Bank Transfer", "Cash", "Mobile Banking" }[i % 3],
                recordDate = today.AddDays(-3 + i / 3)
            }, ct);
        }
        for (var i = 0; i < 12; i++)
        {
            var trip = trips[i % 6];
            var date = DateOnly.FromDateTime(trip.StartsAt.UtcDateTime);
            await Ensure<FuelEntry>("fuel", $"DEMO-FUEL-{i + 1:000}", new
            {
                name = $"Diesel refill {i + 1}",
                vehicleId = trip.VehicleId,
                tripId = trip.Id,
                liters = 45 + i * 3,
                unitPrice = 105,
                recordDate = date
            }, ct);
            await Ensure<Expense>("expenses", $"DEMO-EXP-{i + 1:000}", new
            {
                name = $"{new[] { "Toll", "Parking", "Driver allowance" }[i % 3]} for {trip.Reference}",
                tripId = trip.Id,
                vehicleId = trip.VehicleId,
                amount = 500 + i * 150,
                category = new[] { "Toll", "Parking", "Driver allowance" }[i % 3],
                recordDate = date
            }, ct);
        }
        for (var i = 0; i < 6; i++)
        {
            await Ensure<Income>("income", $"DEMO-INC-{i + 1:000}", new
            {
                name = $"Additional handling service {i + 1}",
                tripId = trips[i].Id,
                amount = 1500 + i * 250,
                category = "Handling service",
                recordDate = today.AddDays(-6 + i)
            }, ct);
            await Ensure<Maintenance>("maintenance", $"DEMO-MNT-{i + 1:000}", new
            {
                name = new[] { "Engine inspection", "Oil and filter change", "Brake service", "Tire replacement", "Fitness inspection", "Cooling system service" }[i],
                vehicleId = vehicles[i is 0 or 2 ? 6 : i % 6].Id,
                scheduledDate = today.AddDays(i is 1 or 5 ? -20 + i : i == 2 ? 0 : 7 + i),
                amount = 2500 + i * 1000,
                status = new[] { "Scheduled", "Completed", "InProgress", "Cancelled", "Scheduled", "Completed" }[i]
            }, ct);
        }
        for (var i = 0; i < 10; i++)
            await Ensure<Document>("documents", $"DEMO-DOC-{i + 1:000}", new
            {
                name = $"{(i < 8 ? "Vehicle registration" : "Driver license")} metadata {i + 1}",
                vehicleId = i < 8 ? (Guid?)vehicles[i].Id : null,
                driverId = i >= 8 ? (Guid?)drivers[i - 8].Id : null,
                storageKey = $"demo/metadata/document-{i + 1:000}.pdf",
                expiresOn = today.AddDays(i < 8 ? 90 + i * 10 : -i),
                status = i < 8 ? "Active" : "Expired",
                notes = "Demo metadata only. No physical file has been uploaded."
            }, ct);
        string[] notices = ["Invoice payment received", "Upcoming vehicle fitness renewal", "Driver license review due", "Trip scheduled", "Booking awaiting confirmation", "Maintenance in progress"];
        for (var i = 0; i < 12; i++)
            await Ensure<Notification>("notifications", $"DEMO-NTF-{i + 1:000}", new
            {
                name = notices[i % notices.Length],
                read = i < 5,
                notes = $"Demonstration workspace notification {i + 1}. Review related operational records in the navigation."
            }, ct);
        for (var i = 0; i < 4; i++)
            await Ensure<SupportTicket>("support", $"DEMO-SUPT-{i + 1:000}", new
            {
                name = new[] { "Invoice reference clarification", "Vehicle document review", "Driver account access", "Booking schedule question" }[i],
                message = "Sample internal support request for the demo workspace. No email or external message is sent by this seed.",
                status = i == 3 ? "Closed" : "Open"
            }, ct);
        if (createdRecords > 0 || createdUsers > 0 || linkedDriverAccount)
        {
            db.AuditEvents.Add(new() { OrganizationId = OrganizationId, UserId = owner.Id, Resource = "demo-seed", Action = "seed", RecordId = OrganizationId });
            organization.Revision++;
            await db.SaveChangesAsync(ct);
        }
        var dashboard = await operations.Dashboard(actor, ct);
        await transaction.CommitAsync(ct);
        return new(OrganizationId, organization.Name, createdUsers, createdRecords, preservedRecords, Accounts, dashboard);
    }

    private async Task<T> Ensure<T>(string resource, string reference, object values, CancellationToken ct) where T : Record
    {
        var existing = await db.Set<T>().SingleOrDefaultAsync(x => x.OrganizationId == OrganizationId && x.Reference == reference, ct);
        if (existing is not null) { preservedRecords++; return existing; }
        var input = JsonSerializer.SerializeToElement(values, JsonOptions);
        var fields = input.EnumerateObject().ToDictionary(x => x.Name, x => x.Value);
        fields["reference"] = JsonSerializer.SerializeToElement(reference);
        var record = await operations.Create(actor, resource, JsonSerializer.SerializeToElement(fields, JsonOptions), ct);
        createdRecords++;
        return (T)record;
    }
}
