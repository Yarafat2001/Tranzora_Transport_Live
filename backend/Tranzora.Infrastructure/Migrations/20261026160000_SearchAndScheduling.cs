using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Tranzora.Infrastructure.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261026160000_SearchAndScheduling")]
public sealed class SearchAndScheduling : Migration
{
    private static readonly string[] Tables = ["Customers", "Suppliers", "Drivers", "Vehicles", "Bookings", "Trips", "Maintenance", "FuelEntries", "Expenses", "Income", "Invoices", "Payments", "Documents", "Notifications", "SupportTickets"];
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gist;");
        foreach (var table in Tables)
        {
            migrationBuilder.Sql($"CREATE INDEX \"IX_{table}_NameSearch\" ON \"{table}\" USING gin (lower(\"Name\") gin_trgm_ops);");
            migrationBuilder.Sql($"CREATE INDEX \"IX_{table}_ReferenceSearch\" ON \"{table}\" USING gin (lower(\"Reference\") gin_trgm_ops);");
        }
        foreach (var field in new[] { "VehicleId", "DriverId", "BookingId" })
            migrationBuilder.Sql($"ALTER TABLE \"Trips\" ADD CONSTRAINT \"EX_Trips_{field}_Interval\" EXCLUDE USING gist (\"OrganizationId\" WITH =, \"{field}\" WITH =, tstzrange(\"StartsAt\", \"EndsAt\", '[)') WITH &&) WHERE (\"Status\" <> 'Cancelled');");
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var field in new[] { "VehicleId", "DriverId", "BookingId" }) migrationBuilder.Sql($"ALTER TABLE \"Trips\" DROP CONSTRAINT \"EX_Trips_{field}_Interval\";");
        foreach (var table in Tables)
        {
            migrationBuilder.Sql($"DROP INDEX \"IX_{table}_NameSearch\";");
            migrationBuilder.Sql($"DROP INDEX \"IX_{table}_ReferenceSearch\";");
        }
        // Extensions may be used by other applications; keep them on rollback.
    }
}
