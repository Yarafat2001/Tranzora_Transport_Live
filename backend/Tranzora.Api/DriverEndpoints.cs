using Tranzora.Application;

namespace Tranzora.Api;

public static class DriverEndpoints
{
    public static void MapDriverEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/driver", async (IDriverWorkspace workspace, HttpContext context, CancellationToken ct) =>
            Results.Ok(await workspace.Overview(context.Actor(), ct)));
        api.MapGet("/driver/trips", async ([AsParameters] PageParameters parameters, IDriverWorkspace workspace, HttpContext context, CancellationToken ct) =>
            Results.Ok(await workspace.Trips(context.Actor(), parameters.ToQuery(), ct)));
        api.MapPut("/driver/trips/{id:guid}", async (Guid id, TripStatusInput input, IDriverWorkspace workspace, HttpContext context, CancellationToken ct) =>
        {
            if (!long.TryParse(context.Request.Headers.IfMatch.ToString().Trim('"'), out var version) || version < 1)
                throw new AppException(428, "If-Match with the current trip version is required.");
            var trip = await workspace.UpdateTrip(context.Actor(), id, version, input.Status, ct);
            context.Response.Headers.ETag = $"\"{trip.Version}\"";
            return Results.Ok(trip);
        });
    }
}
public sealed record TripStatusInput(string Status);
