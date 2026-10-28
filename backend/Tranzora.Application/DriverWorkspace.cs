namespace Tranzora.Application;

public sealed record DriverProfileView(Guid Id, string Name, string Phone, string LicenseNumber, DateOnly LicenseExpiry, string Status);
public sealed record DriverTripView
{
    public Guid Id { get; init; }
    public string Reference { get; init; } = "";
    public string Status { get; init; } = "";
    public long Version { get; init; }
    public string Origin { get; init; } = "";
    public string Destination { get; init; } = "";
    public DateTimeOffset StartsAt { get; init; }
    public DateTimeOffset EndsAt { get; init; }
    public string VehicleName { get; init; } = "";
    public string RegistrationNumber { get; init; } = "";
}
public sealed record DriverVehicleView(Guid Id, string Name, string RegistrationNumber, string VehicleType, decimal Capacity, decimal Odometer, string Status);
public sealed record DriverOverview(DriverProfileView? Profile, int Scheduled, int InProgress, int Completed,
    IReadOnlyList<DriverTripView> RecentTrips, IReadOnlyList<DriverVehicleView> Vehicles);
public interface IDriverWorkspace
{
    Task<DriverOverview> Overview(Actor actor, CancellationToken ct);
    Task<PageResult> Trips(Actor actor, PageQuery query, CancellationToken ct);
    Task<DriverTripView> UpdateTrip(Actor actor, Guid id, long version, string status, CancellationToken ct);
}
