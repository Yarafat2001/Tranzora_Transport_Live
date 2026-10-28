using Npgsql;
using StackExchange.Redis;
namespace Tranzora.Api;

// Render supplies datastore URLs; native deployments may keep their existing strings.
public static class DeploymentConnections
{
    public static string Postgres(IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(config["DATABASE_URL"]))
            return config.GetConnectionString("Postgres") ?? throw new InvalidOperationException("PostgreSQL configuration is required.");
        if (!Uri.TryCreate(config["DATABASE_URL"], UriKind.Absolute, out var uri) || uri.Scheme is not ("postgres" or "postgresql"))
            throw new InvalidOperationException("DATABASE_URL must be a PostgreSQL URL.");
        var credentials = uri.UserInfo.Split(':', 2);
        if (credentials.Length != 2 || string.IsNullOrEmpty(uri.Host) || uri.AbsolutePath.Length < 2)
            throw new InvalidOperationException("DATABASE_URL must include host, database and credentials.");
        var result = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host, Port = uri.IsDefaultPort ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath[1..]),
            Username = Uri.UnescapeDataString(credentials[0]), Password = Uri.UnescapeDataString(credentials[1]),
            SslMode = SslMode.Require, IncludeErrorDetail = false, MaxPoolSize = 30, Timeout = 10
        };
        foreach (var item in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = item.Split('=', 2);
            if (pair.Length != 2 || pair[0] != "sslmode" || !Enum.TryParse<SslMode>(pair[1], true, out var ssl))
                throw new InvalidOperationException("DATABASE_URL contains an unsupported query option.");
            result.SslMode = ssl;
        }
        return result.ConnectionString;
    }
    public static ConfigurationOptions Redis(string value)
    {
        if (!value.StartsWith("redis://", StringComparison.OrdinalIgnoreCase) && !value.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase))
            return ConfigurationOptions.Parse(value);
        var uri = new Uri(value);
        var result = new ConfigurationOptions { AbortOnConnectFail = false, ConnectTimeout = 1000, SyncTimeout = 1000, Ssl = uri.Scheme == "rediss" };
        result.EndPoints.Add(uri.Host, uri.IsDefaultPort ? 6379 : uri.Port);
        if (!string.IsNullOrEmpty(uri.UserInfo))
        {
            var credentials = uri.UserInfo.Split(':', 2);
            if (credentials.Length != 2) throw new InvalidOperationException("Redis URL credentials are invalid.");
            result.User = Uri.UnescapeDataString(credentials[0]); result.Password = Uri.UnescapeDataString(credentials[1]);
        }
        return result;
    }
}
