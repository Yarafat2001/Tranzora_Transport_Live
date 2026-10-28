using Microsoft.EntityFrameworkCore;
using Tranzora.Application;
using Tranzora.Domain;

namespace Tranzora.Infrastructure;

public sealed class DriverWorkspace(AppDbContext db) : IDriverWorkspace
{
    private async Task<Guid?> DriverId(Actor actor, CancellationToken ct)
    {
        if (actor.Role != "Driver") throw new AppException(403, "This workspace is for driver accounts.");
        return await db.Users.Where(x => x.Id == actor.UserId && x.OrganizationId == actor.OrganizationId && x.Active)
            .Select(x => x.DriverId).SingleAsync(ct);
    }
    private IQueryable<DriverTripView> AssignedTrips(Guid tenant, Guid driverId) =>
        from trip in db.Set<Trip>().AsNoTracking()
        join booking in db.Set<Booking>() on new { Id = trip.BookingId, trip.OrganizationId } equals new { booking.Id, booking.OrganizationId }
        join vehicle in db.Set<Vehicle>() on new { Id = trip.VehicleId, trip.OrganizationId } equals new { vehicle.Id, vehicle.OrganizationId }
        where trip.OrganizationId == tenant && trip.DriverId == driverId
        select new DriverTripView { Id = trip.Id, Reference = trip.Reference, Status = trip.Status, Version = trip.Version,
            Origin = booking.Origin, Destination = booking.Destination, StartsAt = trip.StartsAt, EndsAt = trip.EndsAt,
            VehicleName = vehicle.Name, RegistrationNumber = vehicle.RegistrationNumber };

    public async Task<DriverOverview> Overview(Actor actor, CancellationToken ct)
    {
        var id = await DriverId(actor, ct);
        if (id is null) return new(null, 0, 0, 0, [], []);
        var profile = await db.Set<Driver>().Where(x => x.Id == id && x.OrganizationId == actor.OrganizationId)
            .Select(x => new DriverProfileView(x.Id, x.Name, x.Phone, x.LicenseNumber, x.LicenseExpiry, x.Status)).SingleAsync(ct);
        var trips = AssignedTrips(actor.OrganizationId, id.Value);
        var vehicles = await db.Set<Vehicle>().AsNoTracking().Where(vehicle => vehicle.OrganizationId == actor.OrganizationId &&
            db.Set<Trip>().Any(trip => trip.OrganizationId == actor.OrganizationId && trip.DriverId == id && trip.VehicleId == vehicle.Id && trip.Status != "Cancelled"))
            .OrderBy(x => x.Name).Select(x => new DriverVehicleView(x.Id, x.Name, x.RegistrationNumber, x.VehicleType, x.Capacity, x.Odometer, x.Status)).ToArrayAsync(ct);
        return new(profile, await trips.CountAsync(x => x.Status == "Scheduled", ct), await trips.CountAsync(x => x.Status == "InProgress", ct),
            await trips.CountAsync(x => x.Status == "Completed", ct),
            await trips.OrderByDescending(x => x.StartsAt).Take(6).ToArrayAsync(ct), vehicles);
    }
    public async Task<PageResult> Trips(Actor actor, PageQuery query, CancellationToken ct)
    {
        Operations.ValidatePage(query);
        var id = await DriverId(actor, ct);
        if (id is null) return new([], query.Page, query.PageSize, 0);
        var trips = AssignedTrips(actor.OrganizationId, id.Value);
        if (!string.IsNullOrWhiteSpace(query.Status)) trips = trips.Where(x => x.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.ToLowerInvariant();
            trips = trips.Where(x => x.Reference.ToLower().Contains(term) || x.Origin.ToLower().Contains(term) || x.Destination.ToLower().Contains(term));
        }
        var count = await trips.LongCountAsync(ct);
        var rows = await trips.OrderByDescending(x => x.StartsAt).ThenBy(x => x.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToArrayAsync(ct);
        return new(rows.Cast<object>().ToArray(), query.Page, query.PageSize, count);
    }
    public async Task<DriverTripView> UpdateTrip(Actor actor, Guid id, long version, string status, CancellationToken ct)
    {
        var driverId = await DriverId(actor, ct);
        var trip = await db.Set<Trip>().SingleOrDefaultAsync(x => x.OrganizationId == actor.OrganizationId && x.DriverId == driverId && x.Id == id, ct)
            ?? throw new AppException(404, "Assigned trip not found.");
        if (trip.Version != version) throw new AppException(412, "Trip changed. Reload before updating.");
        if (!(trip.Status == "Scheduled" && status == "InProgress" || trip.Status == "InProgress" && status == "Completed"))
            throw new AppException(409, "You can start a scheduled trip or complete a trip in progress.");
        var driver = await db.Set<Driver>().SingleAsync(x => x.Id == driverId && x.OrganizationId == actor.OrganizationId, ct);
        var vehicle = await db.Set<Vehicle>().SingleAsync(x => x.Id == trip.VehicleId && x.OrganizationId == actor.OrganizationId, ct);
        if (status == "InProgress" && (driver.Status != "Active" || vehicle.Status != "Active" || driver.LicenseExpiry < DateOnly.FromDateTime(DateTime.UtcNow)))
            throw new AppException(409, "Driver, vehicle or license is not available for this trip.");
        trip.Status = status; trip.Version++; trip.UpdatedAt = DateTimeOffset.UtcNow;
        db.AuditEvents.Add(new() { OrganizationId = actor.OrganizationId, UserId = actor.UserId, Resource = "trips", RecordId = id, Action = status == "InProgress" ? "driver-start" : "driver-complete" });
        await db.SaveChangesAsync(ct);
        return await AssignedTrips(actor.OrganizationId, driverId!.Value).SingleAsync(x => x.Id == id, ct);
    }
}
