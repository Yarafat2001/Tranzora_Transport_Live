namespace Tranzora.Api;

public static class WebSecurity
{
    // One explicit allowlist drives CORS and mutation-origin validation.
    // Cors:AllowedOrigins remains supported for existing deployments.
    public static string[] Origins(IConfiguration config) =>
        (config.GetSection("App:AllowedOrigins").Get<string[]>() ?? [])
        .Concat(config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
        .Append(config["App:PublicOrigin"] ?? "")
        .Append(config["AUTH_URL"] ?? "")
        .Append(config["RENDER_EXTERNAL_URL"] ?? "")
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Select(value => {
            if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) ||
                uri.Scheme is not ("http" or "https") || uri.Host.Contains('*') ||
                uri.AbsolutePath != "/" || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
                throw new InvalidOperationException("Allowed origins must be exact HTTP(S) origins without paths or wildcards.");
            return uri.GetLeftPart(UriPartial.Authority);
        }).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();

    public static SameSiteMode SameSite(IConfiguration config)
    {
        var value = config["App:CookieSameSite"] ?? "Lax";
        if (!Enum.TryParse<SameSiteMode>(value, true, out var mode) ||
            mode is not (SameSiteMode.Lax or SameSiteMode.Strict or SameSiteMode.None))
            throw new InvalidOperationException("App:CookieSameSite must be Lax, Strict or None.");
        if (mode == SameSiteMode.None && !config.GetValue("App:SecureCookies", true))
            throw new InvalidOperationException("SameSite=None requires App:SecureCookies=true.");
        return mode;
    }
}
