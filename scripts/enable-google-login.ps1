param(
    [Parameter(Mandatory=$true)][string]$CredentialPath,
    [string]$Origin = 'http://localhost:3000',
    [string]$Image,
    [switch]$RestartLocalApi
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$credentials = (Get-Content -LiteralPath $CredentialPath -Raw | ConvertFrom-Json).web
if (-not $credentials.client_id -or -not $credentials.client_secret) { throw 'A Google Web application credential JSON is required.' }
if ($credentials.client_id -match '[\r\n]' -or $credentials.client_secret -match '[\r\n]') { throw 'Invalid credential format.' }
$uri = [Uri]$Origin
if (-not $uri.IsLoopback -or $uri.AbsolutePath -ne '/') { throw 'This helper activates local development only. Configure production through the secret manager.' }
function Set-LocalEnv([string]$path, [hashtable]$values, [string]$fallback = '') {
    $lines = if (Test-Path -LiteralPath $path) { @(Get-Content -LiteralPath $path) } elseif ($fallback) { @(Get-Content -LiteralPath $fallback) } else { @() }
    foreach ($key in $values.Keys) {
        $pattern = '^' + [regex]::Escape($key) + '='
        $lines = @($lines | Where-Object { $_ -notmatch $pattern })
        $lines += "$key=$($values[$key])"
    }
    [IO.File]::WriteAllLines($path, [string[]]$lines, [Text.UTF8Encoding]::new($false))
}
Set-LocalEnv (Join-Path $root '.env') @{ GOOGLE_CLIENT_ID=$credentials.client_id; GOOGLE_CLIENT_SECRET=$credentials.client_secret; AUTH_URL=$Origin; APP_SECURE_COOKIES='false' } (Join-Path $root '.env.example')
Set-LocalEnv (Join-Path $root '.env.local') @{ AUTH_URL=$Origin }
if ($RestartLocalApi) {
    $name = 'tranzora-api-dev'
    $container = (docker inspect $name | ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0 -or -not $container) { throw 'The local Tranzora API container was not found.' }
    if ($container.Mounts.Count -gt 0 -or $container.HostConfig.PortBindings.'8080/tcp'[0].HostPort -ne '5080') { throw 'Unexpected container layout. No container was changed.' }
    $environment = @($container.Config.Env | Where-Object { $_ -notmatch '^(Authentication__google__ClientId|Authentication__google__ClientSecret|App__PublicOrigin)=' })
    $environment += "Authentication__google__ClientId=$($credentials.client_id)", "Authentication__google__ClientSecret=$($credentials.client_secret)", "App__PublicOrigin=$Origin"
    $envPath = Join-Path $root '.env.google-api'
    [IO.File]::WriteAllLines($envPath, [string[]]$environment, [Text.UTF8Encoding]::new($false))
    if (-not $Image) { $Image = $container.Config.Image }
    docker run --rm --network $container.HostConfig.NetworkMode --env-file $envPath $Image --migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. The running API was not changed.' }
    $backup = "$name-pre-google-$(Get-Date -Format yyyyMMddHHmmss)"
    docker stop $name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the API; configuration files were saved.' }
    docker rename $name $backup
    if ($LASTEXITCODE -ne 0) { docker start $name | Out-Null; throw 'Could not preserve the previous API container.' }
    docker run -d --name $name --network $container.HostConfig.NetworkMode --restart unless-stopped --env-file $envPath -p 5080:8080 $Image | Out-Null
    $ready = $false
    if ($LASTEXITCODE -eq 0) {
        for ($attempt=0; $attempt -lt 15; $attempt++) {
            try { $health = Invoke-RestMethod 'http://localhost:5080/health/ready' -TimeoutSec 2; $ready = $true; break } catch { Start-Sleep -Seconds 2 }
        }
    }
    if (-not $ready) {
        docker rm -f $name | Out-Null
        docker rename $backup $name
        docker start $name | Out-Null
        throw 'The updated API did not become ready. The previous container was restored.'
    }
    Write-Output "Local API activated; previous container retained as $backup."
}
Write-Output "Google configuration saved in ignored local environment files. Register callback: $Origin/api/auth/callback/google"
