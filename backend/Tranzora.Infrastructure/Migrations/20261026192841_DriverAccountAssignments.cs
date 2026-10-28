using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Tranzora.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DriverAccountAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "DriverId",
                table: "Users",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_DriverId_OrganizationId",
                table: "Users",
                columns: new[] { "DriverId", "OrganizationId" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_OrganizationId_DriverId",
                table: "Users",
                columns: new[] { "OrganizationId", "DriverId" },
                unique: true,
                filter: "\"DriverId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_Users_Drivers_DriverId_OrganizationId",
                table: "Users",
                columns: new[] { "DriverId", "OrganizationId" },
                principalTable: "Drivers",
                principalColumns: new[] { "Id", "OrganizationId" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Users_Drivers_DriverId_OrganizationId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_DriverId_OrganizationId",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_OrganizationId_DriverId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DriverId",
                table: "Users");
        }
    }
}
