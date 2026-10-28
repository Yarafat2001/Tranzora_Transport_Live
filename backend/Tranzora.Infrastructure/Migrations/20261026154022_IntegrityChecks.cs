using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tranzora.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class IntegrityChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(name: "Version", table: "Users", type: "bigint", nullable: false, defaultValue: 1L);
            migrationBuilder.AddCheckConstraint(
                name: "CK_Vehicles_Capacity_Nonnegative",
                table: "Vehicles",
                sql: "\"Capacity\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Vehicles_Odometer_Nonnegative",
                table: "Vehicles",
                sql: "\"Odometer\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Trips_Interval",
                table: "Trips",
                sql: "\"EndsAt\" > \"StartsAt\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Payments_Amount_Nonnegative",
                table: "Payments",
                sql: "\"Amount\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Maintenance_Amount_Nonnegative",
                table: "Maintenance",
                sql: "\"Amount\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Invoices_Amount_Nonnegative",
                table: "Invoices",
                sql: "\"Amount\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Income_Amount_Nonnegative",
                table: "Income",
                sql: "\"Amount\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FuelEntries_Liters_Nonnegative",
                table: "FuelEntries",
                sql: "\"Liters\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FuelEntries_UnitPrice_Nonnegative",
                table: "FuelEntries",
                sql: "\"UnitPrice\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Expenses_Amount_Nonnegative",
                table: "Expenses",
                sql: "\"Amount\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Bookings_Amount_Nonnegative",
                table: "Bookings",
                sql: "\"Amount\" >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Version", table: "Users");
            migrationBuilder.DropCheckConstraint(
                name: "CK_Vehicles_Capacity_Nonnegative",
                table: "Vehicles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Vehicles_Odometer_Nonnegative",
                table: "Vehicles");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Trips_Interval",
                table: "Trips");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Payments_Amount_Nonnegative",
                table: "Payments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Maintenance_Amount_Nonnegative",
                table: "Maintenance");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Invoices_Amount_Nonnegative",
                table: "Invoices");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Income_Amount_Nonnegative",
                table: "Income");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FuelEntries_Liters_Nonnegative",
                table: "FuelEntries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FuelEntries_UnitPrice_Nonnegative",
                table: "FuelEntries");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Expenses_Amount_Nonnegative",
                table: "Expenses");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Bookings_Amount_Nonnegative",
                table: "Bookings");
        }
    }
}
