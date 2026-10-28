using System.Text.Json;
using Tranzora.Domain;

namespace Tranzora.Application;

public sealed class AppException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}
public sealed record Actor(Guid UserId, Guid OrganizationId, string Role);
public sealed record PageQuery(int Page = 1, int PageSize = 20, string? Search = null, string? Status = null);
public sealed record PageResult(IReadOnlyList<object> Items, int Page, int PageSize, long TotalCount);
public sealed record ResourceSchema(string Name, string[] Fields, string[] Required, string[] Statuses);

public interface IOperations
{
    IReadOnlyList<ResourceSchema> Schemas { get; }
    Task<PageResult> List(Actor actor, string resource, PageQuery query, CancellationToken ct);
    Task<Record> Get(Actor actor, string resource, Guid id, CancellationToken ct);
    Task<Record> Create(Actor actor, string resource, JsonElement input, CancellationToken ct);
    Task<Record> Update(Actor actor, string resource, Guid id, long version, JsonElement input, CancellationToken ct);
    Task Delete(Actor actor, string resource, Guid id, long version, CancellationToken ct);
    Task<object> Dashboard(Actor actor, CancellationToken ct);
    Task<PageResult> Audit(Actor actor, PageQuery query, CancellationToken ct);
}

public interface IRecordStore
{
    Task<PageResult> List(Type type, Guid tenant, PageQuery query, CancellationToken ct);
    Task<Record?> Find(Type type, Guid tenant, Guid id, CancellationToken ct);
    Task Add(Record record, CancellationToken ct);
    void Remove(Record record);
    Task ValidateRelations(Record record, CancellationToken ct);
    Task Audit(Actor actor, string action, string resource, Record record, CancellationToken ct);
    Task Save(CancellationToken ct);
    Task<object> Dashboard(Guid tenant, CancellationToken ct);
    Task<PageResult> AuditPage(Guid tenant, PageQuery query, CancellationToken ct);
}

public static class Permissions
{
    public static readonly string[] Roles = ["Super Admin", "Business Admin", "Manager", "Accountant", "Dispatcher", "Driver", "Support Staff", "Viewer"];
    public static bool IsAdmin(string role) => role is "Super Admin" or "Business Admin";
    public static void Demand(Actor actor, string resource, bool write)
    {
        if (IsAdmin(actor.Role)) return;
        var allowed = actor.Role switch
        {
            "Manager" => resource is not "users" and not "settings",
            "Accountant" => resource is "customers" or "suppliers" or "invoices" or "payments" or "expenses" or "income" || (!write && resource is "trips" or "vehicles" or "drivers" or "bookings" or "fuel" or "maintenance" or "dashboard"),
            "Dispatcher" => resource is "trips" or "bookings" or "vehicles" or "drivers" or "customers" or "notifications" || (!write && resource == "dashboard"),
            "Viewer" => !write && resource is not "users" and not "settings" and not "audit-logs",
            "Support Staff" => resource is "support" or "notifications" || (!write && resource == "customers"),
            "Driver" => resource == "driver",
            _ => false
        };
        if (!allowed) throw new AppException(403, "You do not have permission for this operation.");
    }
}
