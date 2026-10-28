using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Tranzora.Infrastructure;

namespace Tranzora.Api;

// Applies pending EF Core migrations to a database that may already hold the schema.
// A database created before the migration list was consolidated keeps its tables but
// records the retired migration ids, so the surviving migration would replay CREATE
// TABLE against objects that already exist. Such a database is baselined instead: every
// table and column the model expects is compared with the live schema first, and only a
// complete match is recorded as applied. Anything still absent is migrated for real.
public static class SchemaMigrations
{
    public static async Task<string> ApplyAsync(AppDbContext db, CancellationToken ct = default)
    {
        var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
        if (pending.Count == 0) return "Schema is up to date.";

        // The context hands the same physical connection to the checks below and to EF.
        await db.Database.OpenConnectionAsync(ct);
        try
        {
            var missing = await MissingObjectsAsync(db, ct);
            if (missing.Count > 0)
            {
                await db.Database.MigrateAsync(ct);
                return $"Applied {pending.Count} migration(s) ({string.Join(", ", pending)}); "
                    + $"{missing.Count} expected object(s) were absent and are now created.";
            }

            await BaselineAsync(db, pending, ct);
            return $"Baselined {pending.Count} migration(s) ({string.Join(", ", pending)}) against the existing schema.";
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private static async Task<List<string>> MissingObjectsAsync(AppDbContext db, CancellationToken ct)
    {
        var live = await ReadSchemaAsync(db, ct);
        var missing = new List<string>();
        foreach (var (table, columns) in ExpectedSchema(db))
        {
            if (!live.TryGetValue(table, out var present))
            {
                missing.Add(table);
                continue;
            }
            missing.AddRange(columns.Where(column => !present.Contains(column)).Select(column => $"{table}.{column}"));
        }
        return missing;
    }

    private static Dictionary<string, HashSet<string>> ExpectedSchema(AppDbContext db)
    {
        var expected = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        foreach (var entity in db.Model.GetEntityTypes())
        {
            var storeObject = entity.GetTableName() is null
                ? null
                : StoreObjectIdentifier.Create(entity, StoreObjectType.Table);
            if (storeObject is null) continue;
            if (!expected.TryGetValue(storeObject.Value.Name, out var columns))
                expected[storeObject.Value.Name] = columns = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in entity.GetProperties())
            {
                var column = property.GetColumnName(storeObject.Value);
                if (column is not null) columns.Add(column);
            }
        }
        return expected;
    }

    private static async Task<Dictionary<string, HashSet<string>>> ReadSchemaAsync(AppDbContext db, CancellationToken ct)
    {
        var schema = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var connection = db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()";
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            if (!schema.TryGetValue(reader.GetString(0), out var columns))
                schema[reader.GetString(0)] = columns = new HashSet<string>(StringComparer.Ordinal);
            columns.Add(reader.GetString(1));
        }
        return schema;
    }

    private static async Task BaselineAsync(AppDbContext db, IReadOnlyList<string> pending, CancellationToken ct)
    {
        var version = typeof(Migration).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        var connection = db.Database.GetDbConnection();
        await using (var ensure = connection.CreateCommand())
        {
            ensure.CommandText = """
                CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
                    "MigrationId" character varying(150) NOT NULL,
                    "ProductVersion" character varying(32) NOT NULL,
                    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
                )
                """;
            await ensure.ExecuteNonQueryAsync(ct);
        }
        foreach (var migrationId in pending)
        {
            await using var insert = connection.CreateCommand();
            insert.CommandText = """
                INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
                VALUES (@migrationId, @version)
                ON CONFLICT ("MigrationId") DO NOTHING
                """;
            var id = insert.CreateParameter();
            id.ParameterName = "migrationId";
            id.Value = migrationId;
            var product = insert.CreateParameter();
            product.ParameterName = "version";
            product.Value = version;
            insert.Parameters.Add(id);
            insert.Parameters.Add(product);
            await insert.ExecuteNonQueryAsync(ct);
        }
    }
}
