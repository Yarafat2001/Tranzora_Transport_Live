using System.Globalization;
using System.Reflection;
using System.Text.Json;
using Tranzora.Domain;

namespace Tranzora.Application;

public sealed class Operations(IRecordStore store) : IOperations
{
    private sealed record Definition(Type Type, string Fields, string Required, string Statuses);
    private static readonly Dictionary<string, Definition> Definitions = new()
    {
        ["customers"] = new(typeof(Customer), "email phone address", "phone", "Active Inactive"),
        ["suppliers"] = new(typeof(Supplier), "email phone address", "phone", "Active Inactive"),
        ["drivers"] = new(typeof(Driver), "phone licenseNumber licenseExpiry", "phone licenseNumber licenseExpiry", "Active Inactive"),
        ["vehicles"] = new(typeof(Vehicle), "registrationNumber vehicleType capacity odometer", "registrationNumber vehicleType capacity", "Active Inactive Maintenance"),
        ["bookings"] = new(typeof(Booking), "customerId origin destination amount scheduledDate", "customerId origin destination amount scheduledDate", "Pending Confirmed Completed Cancelled"),
        ["trips"] = new(typeof(Trip), "bookingId vehicleId driverId startsAt endsAt", "bookingId vehicleId driverId startsAt endsAt", "Scheduled InProgress Completed Cancelled"),
        ["maintenance"] = new(typeof(Maintenance), "vehicleId scheduledDate amount", "vehicleId scheduledDate amount", "Scheduled InProgress Completed Cancelled"),
        ["fuel"] = new(typeof(FuelEntry), "vehicleId tripId liters unitPrice recordDate", "vehicleId liters unitPrice recordDate", "Posted"),
        ["expenses"] = new(typeof(Expense), "tripId vehicleId amount category recordDate", "amount category recordDate", "Posted"),
        ["income"] = new(typeof(Income), "tripId amount category recordDate", "amount category recordDate", "Posted"),
        ["invoices"] = new(typeof(Invoice), "customerId tripId amount dueDate", "customerId amount dueDate", "Draft Issued Cancelled"),
        ["payments"] = new(typeof(Payment), "invoiceId amount method recordDate", "invoiceId amount method recordDate", "Posted"),
        ["documents"] = new(typeof(Document), "vehicleId driverId storageKey expiresOn", "storageKey", "Active Expired"),
        ["notifications"] = new(typeof(Notification), "read", "", "Active"),
        ["support"] = new(typeof(SupportTicket), "message", "message", "Open Closed")
    };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static string[] Split(string value) => value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    public IReadOnlyList<ResourceSchema> Schemas { get; } = Definitions.Select(pair => new ResourceSchema(pair.Key,
        ["name", "reference", "status", "notes", .. Split(pair.Value.Fields)], ["name", "reference", .. Split(pair.Value.Required)], Split(pair.Value.Statuses))).ToArray();

    public static void ValidatePage(PageQuery query)
    {
        if (query.Page is < 1 or > 10000 || query.PageSize is < 1 or > 100 || query.Search?.Length > 100 || query.Status?.Length > 40)
            throw new AppException(400, "Use page 1–10000, pageSize 1–100, and search up to 100 characters.");
    }
    private static Definition DefinitionFor(string resource) => Definitions.TryGetValue(resource, out var definition)
        ? definition : throw new AppException(404, "Unknown resource.");

    public Task<PageResult> List(Actor actor, string resource, PageQuery query, CancellationToken ct)
    {
        Permissions.Demand(actor, resource, false);
        ValidatePage(query);
        return store.List(DefinitionFor(resource).Type, actor.OrganizationId, query, ct);
    }
    public async Task<Record> Get(Actor actor, string resource, Guid id, CancellationToken ct)
    {
        Permissions.Demand(actor, resource, false);
        return await store.Find(DefinitionFor(resource).Type, actor.OrganizationId, id, ct)
            ?? throw new AppException(404, "Record not found.");
    }
    public async Task<Record> Create(Actor actor, string resource, JsonElement input, CancellationToken ct)
    {
        Permissions.Demand(actor, resource, true);
        var definition = DefinitionFor(resource);
        var record = (Record)Activator.CreateInstance(definition.Type)!;
        record.OrganizationId = actor.OrganizationId;
        record.Status = Split(definition.Statuses)[0];
        Apply(record, definition, input);
        await store.ValidateRelations(record, ct);
        await store.Add(record, ct);
        await store.Audit(actor, "create", resource, record, ct);
        await store.Save(ct);
        return record;
    }
    public async Task<Record> Update(Actor actor, string resource, Guid id, long version, JsonElement input, CancellationToken ct)
    {
        Permissions.Demand(actor, resource, true);
        var record = await Get(actor, resource, id, ct);
        if (record.Version != version) throw new AppException(412, "The record changed. Reload it before editing.");
        if (record is Payment or Income or Expense or FuelEntry) throw new AppException(409, "Posted financial records are immutable. Record a reviewed correction separately.");
        var oldStatus = record.Status;
        Apply(record, DefinitionFor(resource), input);
        if (oldStatus is "Completed" or "Cancelled" && oldStatus != record.Status)
            throw new AppException(409, "Completed and cancelled records cannot be reopened.");
        await store.ValidateRelations(record, ct);
        record.Version++;
        record.UpdatedAt = DateTimeOffset.UtcNow;
        await store.Audit(actor, "update", resource, record, ct);
        await store.Save(ct);
        return record;
    }
    public async Task Delete(Actor actor, string resource, Guid id, long version, CancellationToken ct)
    {
        Permissions.Demand(actor, resource, true);
        var record = await Get(actor, resource, id, ct);
        if (record.Version != version) throw new AppException(412, "The record changed. Reload it before deleting.");
        if (record is Payment or Invoice or Income or Expense or FuelEntry || record.Status == "Completed")
            throw new AppException(409, "Financial and completed records must be retained for auditing.");
        store.Remove(record);
        await store.Audit(actor, "delete", resource, record, ct);
        await store.Save(ct);
    }
    public Task<object> Dashboard(Actor actor, CancellationToken ct)
    {
        Permissions.Demand(actor, "dashboard", false);
        return store.Dashboard(actor.OrganizationId, ct);
    }
    public Task<PageResult> Audit(Actor actor, PageQuery query, CancellationToken ct)
    {
        Permissions.Demand(actor, "audit-logs", false);
        ValidatePage(query);
        return store.AuditPage(actor.OrganizationId, query, ct);
    }

    private static void Apply(Record record, Definition definition, JsonElement input)
    {
        if (input.ValueKind != JsonValueKind.Object) throw new AppException(400, "A JSON object is required.");
        var allowed = new HashSet<string>(["name", "reference", "status", "notes", .. Split(definition.Fields)]);
        foreach (var field in input.EnumerateObject())
        {
            if (!allowed.Contains(field.Name)) throw new AppException(400, $"Unknown or read-only field: {field.Name}.");
            var property = definition.Type.GetProperty(field.Name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)!;
            if (field.Value.ValueKind == JsonValueKind.Null && Nullable.GetUnderlyingType(property.PropertyType) is null)
                throw new AppException(400, $"{field.Name} cannot be null.");
            try { property.SetValue(record, field.Value.Deserialize(property.PropertyType, JsonOptions)); }
            catch (Exception ex) when (ex is JsonException or ArgumentException or TargetInvocationException)
            { throw new AppException(400, $"Invalid value for {field.Name}."); }
        }
        foreach (var field in (string[])["name", "reference", .. Split(definition.Required)])
        {
            var value = definition.Type.GetProperty(field, BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)!.GetValue(record);
            if (value is null || value is string text && string.IsNullOrWhiteSpace(text) || value is Guid guid && guid == Guid.Empty || value is DateOnly date && date == default || value is DateTimeOffset time && time == default)
                throw new AppException(400, $"{field} is required.");
        }
        if (!Split(definition.Statuses).Contains(record.Status)) throw new AppException(400, "Invalid status.");
        foreach (var property in definition.Type.GetProperties())
        {
            var value = property.GetValue(record);
            if (value is string text && text.Length > (property.Name is "Notes" or "Message" ? 4000 : 200))
                throw new AppException(400, $"{property.Name} is too long.");
            if (value is decimal amount && (amount < 0 || amount > 999999999999m || decimal.Round(amount, 2) != amount))
                throw new AppException(400, $"{property.Name} must be a non-negative number with at most two decimal places.");
        }
        if (record is Invoice { Amount: <= 0 } or Payment { Amount: <= 0 } or Income { Amount: <= 0 } or Expense { Amount: <= 0 } or FuelEntry { Liters: <= 0 } or FuelEntry { UnitPrice: <= 0 } or Vehicle { Capacity: <= 0 })
            throw new AppException(400, "Amounts, fuel quantities, and vehicle capacity must be positive.");
        if (record is Trip trip && trip.EndsAt <= trip.StartsAt) throw new AppException(400, "Trip end must be after its start.");
        if (record is Trip utcTrip) { utcTrip.StartsAt = utcTrip.StartsAt.ToUniversalTime(); utcTrip.EndsAt = utcTrip.EndsAt.ToUniversalTime(); }
        if (record is Customer customer && customer.Email.Length > 0 && !System.Net.Mail.MailAddress.TryCreate(customer.Email, out _))
            throw new AppException(400, "Invalid email address.");
        record.Name = record.Name.Trim();
        record.Reference = record.Reference.Trim().ToUpperInvariant();
        if (record is Vehicle vehicle) vehicle.RegistrationNumber = vehicle.RegistrationNumber.Trim().ToUpperInvariant();
    }
}
