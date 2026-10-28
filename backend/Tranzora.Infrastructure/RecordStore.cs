using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Tranzora.Application;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed class RecordStore(AppDbContext db) : IRecordStore
{
    public Task<PageResult> List(Type type, Guid tenant, PageQuery query, CancellationToken ct) =>
        (Task<PageResult>)GetType().GetMethod(nameof(ListTyped), BindingFlags.NonPublic | BindingFlags.Instance)!
            .MakeGenericMethod(type).Invoke(this, [tenant, query, ct])!;

    private async Task<PageResult> ListTyped<T>(Guid tenant, PageQuery query, CancellationToken ct) where T : Record
    {
        var rows = db.Set<T>().AsNoTracking().Where(x => x.OrganizationId == tenant);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLowerInvariant();
            rows = rows.Where(x => x.Name.ToLower().Contains(term) || x.Reference.ToLower().Contains(term));
        }
        if (!string.IsNullOrWhiteSpace(query.Status)) rows = rows.Where(x => x.Status == query.Status);
        var count = await rows.LongCountAsync(ct);
        var items = await rows.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new(items.Cast<object>().ToArray(), query.Page, query.PageSize, count);
    }
    public async Task<Record?> Find(Type type, Guid tenant, Guid id, CancellationToken ct)
    {
        var record = await db.FindAsync(type, [id], ct) as Record;
        return record?.OrganizationId == tenant ? record : null;
    }
    public async Task Add(Record record, CancellationToken ct) => await db.AddAsync(record, ct);
    public void Remove(Record record) => db.Remove(record);
    public Task Audit(Actor actor, string action, string resource, Record record, CancellationToken ct)
    {
        db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Action = action, Resource = resource, RecordId = record.Id });
        return Task.CompletedTask;
    }
    public Task Save(CancellationToken ct) => db.SaveChangesAsync(ct);

    private async Task<T> Related<T>(Guid tenant, Guid id, CancellationToken ct) where T : Record =>
        await db.Set<T>().SingleOrDefaultAsync(x => x.Id == id && x.OrganizationId == tenant, ct)
        ?? throw new AppException(422, $"The related {typeof(T).Name} does not exist in your organization.");

    public async Task ValidateRelations(Record record, CancellationToken ct)
    {
        var tenant = record.OrganizationId;
        switch (record)
        {
            case Booking booking:
                var customer = await Related<Customer>(tenant, booking.CustomerId, ct);
                if (customer.Status != "Active") throw new AppException(409, "Customer is inactive.");
                if (booking.Status == "Cancelled" && await db.Set<Trip>().AnyAsync(x => x.OrganizationId == tenant && x.BookingId == booking.Id && x.Status != "Cancelled", ct))
                    throw new AppException(409, "Cancel the booking's trips first.");
                break;
            case Trip trip:
                var source = await Related<Booking>(tenant, trip.BookingId, ct);
                var vehicle = await Related<Vehicle>(tenant, trip.VehicleId, ct);
                var driver = await Related<Driver>(tenant, trip.DriverId, ct);
                if (trip.Status != "Cancelled")
                {
                    if (source.Status == "Cancelled" || vehicle.Status != "Active" || driver.Status != "Active") throw new AppException(409, "Booking, vehicle, or driver is unavailable.");
                    if (driver.LicenseExpiry < DateOnly.FromDateTime(trip.EndsAt.UtcDateTime)) throw new AppException(409, "Driver license expires before the trip ends.");
                    if (await db.Set<Trip>().AnyAsync(x => x.OrganizationId == tenant && x.Id != trip.Id && x.Status != "Cancelled" &&
                        (x.VehicleId == trip.VehicleId || x.DriverId == trip.DriverId || x.BookingId == trip.BookingId) && x.StartsAt < trip.EndsAt && x.EndsAt > trip.StartsAt, ct))
                        throw new AppException(409, "Vehicle, driver, or booking is already assigned during this interval.");
                }
                break;
            case Maintenance work:
                await Related<Vehicle>(tenant, work.VehicleId, ct);
                break;
            case FuelEntry fuel:
                await Related<Vehicle>(tenant, fuel.VehicleId, ct);
                if (fuel.TripId is { } fuelTrip && (await Related<Trip>(tenant, fuelTrip, ct)).VehicleId != fuel.VehicleId)
                    throw new AppException(422, "Fuel vehicle must match the trip vehicle.");
                break;
            case Expense expense:
                if (expense.VehicleId is { } expenseVehicle) await Related<Vehicle>(tenant, expenseVehicle, ct);
                if (expense.TripId is { } expenseTrip)
                {
                    var linkedTrip = await Related<Trip>(tenant, expenseTrip, ct);
                    if (expense.VehicleId.HasValue && linkedTrip.VehicleId != expense.VehicleId) throw new AppException(422, "Expense vehicle must match the trip vehicle.");
                }
                break;
            case Income income:
                if (income.TripId is { } incomeTrip) await Related<Trip>(tenant, incomeTrip, ct);
                break;
            case Invoice invoice:
                await Related<Customer>(tenant, invoice.CustomerId, ct);
                if (invoice.TripId is { } invoiceTrip)
                {
                    var linkedTrip = await Related<Trip>(tenant, invoiceTrip, ct);
                    if ((await Related<Booking>(tenant, linkedTrip.BookingId, ct)).CustomerId != invoice.CustomerId)
                        throw new AppException(422, "Invoice customer must match the trip customer.");
                }
                if (await db.Set<Payment>().AnyAsync(x => x.OrganizationId == tenant && x.InvoiceId == invoice.Id, ct))
                    throw new AppException(409, "An invoice with payments cannot be modified.");
                break;
            case Payment payment:
                var bill = await Related<Invoice>(tenant, payment.InvoiceId, ct);
                if (bill.Status != "Issued") throw new AppException(409, "Only issued invoices accept payments.");
                var paid = await db.Set<Payment>().Where(x => x.OrganizationId == tenant && x.InvoiceId == bill.Id).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
                if (paid + payment.Amount > bill.Amount) throw new AppException(409, "Payment exceeds the invoice balance.");
                break;
            case Document document:
                if (document.VehicleId is { } documentVehicle) await Related<Vehicle>(tenant, documentVehicle, ct);
                if (document.DriverId is { } documentDriver) await Related<Driver>(tenant, documentDriver, ct);
                if (document.StorageKey.StartsWith('/') || document.StorageKey.Contains("..") || Uri.TryCreate(document.StorageKey, UriKind.Absolute, out _))
                    throw new AppException(400, "Use a relative object-storage key, not a URL or filesystem path.");
                break;
        }
    }

    public async Task<object> Dashboard(Guid tenant, CancellationToken ct)
    {
        var payments = await db.Set<Payment>().Where(x => x.OrganizationId == tenant).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var otherIncome = await db.Set<Income>().Where(x => x.OrganizationId == tenant).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var expenses = await db.Set<Expense>().Where(x => x.OrganizationId == tenant).SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var fuel = await db.Set<FuelEntry>().Where(x => x.OrganizationId == tenant).SumAsync(x => (decimal?)(x.Liters * x.UnitPrice), ct) ?? 0;
        var maintenance = await db.Set<Maintenance>().Where(x => x.OrganizationId == tenant && x.Status == "Completed").SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var invoiced = await db.Set<Invoice>().Where(x => x.OrganizationId == tenant && x.Status == "Issued").SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        return new
        {
            currency = await db.Organizations.Where(x => x.Id == tenant).Select(x => x.Currency).SingleAsync(ct),
            receipts = payments + otherIncome,
            expenses = expenses + fuel + maintenance,
            cashSurplus = payments + otherIncome - expenses - fuel - maintenance,
            outstanding = invoiced - payments,
            vehicles = await db.Set<Vehicle>().CountAsync(x => x.OrganizationId == tenant, ct),
            drivers = await db.Set<Driver>().CountAsync(x => x.OrganizationId == tenant, ct),
            customers = await db.Set<Customer>().CountAsync(x => x.OrganizationId == tenant, ct),
            bookings = await db.Set<Booking>().CountAsync(x => x.OrganizationId == tenant, ct),
            activeTrips = await db.Set<Trip>().CountAsync(x => x.OrganizationId == tenant && x.Status == "InProgress", ct),
            completedTrips = await db.Set<Trip>().CountAsync(x => x.OrganizationId == tenant && x.Status == "Completed", ct)
        };
    }
    public async Task<PageResult> AuditPage(Guid tenant, PageQuery query, CancellationToken ct)
    {
        var rows = db.AuditEvents.AsNoTracking().Where(x => x.OrganizationId == tenant);
        if (!string.IsNullOrWhiteSpace(query.Search)) rows = rows.Where(x => x.Resource.Contains(query.Search) || x.Action.Contains(query.Search));
        var total = await rows.LongCountAsync(ct);
        var items = await rows.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToArrayAsync(ct);
        return new(items.Cast<object>().ToArray(), query.Page, query.PageSize, total);
    }
}
