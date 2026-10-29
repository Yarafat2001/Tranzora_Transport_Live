#!/bin/sh
set -eu
export PORT="${PORT:-3000}"
export AUTH_URL="${AUTH_URL:-${RENDER_EXTERNAL_URL:-http://localhost:$PORT}}"
export APP_ALLOWED_ORIGINS="${APP_ALLOWED_ORIGINS:-$AUTH_URL}"
mode="${TRANZORA_SINGLE_HOST:-auto}"
if [ "$mode" = auto ]; then
  if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then mode=true; else mode=false; fi
fi
if [ "$mode" = false ]; then exec node /app/web/server.js; fi
if [ "$mode" != true ]; then echo 'TRANZORA_SINGLE_HOST must be true, false or auto.' >&2; exit 1; fi
api_port="${INTERNAL_API_PORT:-5080}"
case "$PORT:$api_port" in *[!0-9:]*|'') echo 'Invalid service port.' >&2; exit 1;; esac
if [ "$PORT" = "$api_port" ]; then echo 'Frontend and internal API ports must differ.' >&2; exit 1; fi
export BACKEND_URL="http://127.0.0.1:$api_port"
export App__PublicOrigin="${App__PublicOrigin:-$AUTH_URL}"
export App__SecureCookies="${App__SecureCookies:-true}"
migrate="${RUN_MIGRATIONS:-true}"
unset RUN_MIGRATIONS
if [ "$migrate" = true ]; then dotnet /app/api/Tranzora.Api.dll --migrate; fi
# Explicit opt-in only; DemoSeeder also validates production consent and password.
if [ "${SEED_DEMO_ON_DEPLOY:-false}" = true ]; then dotnet /app/api/Tranzora.Api.dll --seed-demo; fi
api_pid=''
web_pid=''
cleanup() {
  [ -z "$api_pid" ] || kill "$api_pid" 2>/dev/null || true
  [ -z "$web_pid" ] || kill "$web_pid" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 143' TERM INT
ASPNETCORE_HTTP_PORTS="" ASPNETCORE_HTTPS_PORTS="" ASPNETCORE_URLS="http://127.0.0.1:$api_port" dotnet /app/api/Tranzora.Api.dll &
api_pid=$!
node /app/wait-for-api.mjs "$api_pid" "$api_port"
node /app/web/server.js &
web_pid=$!
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do sleep 1; done
echo 'A required application process stopped; stopping the service.' >&2
exit 1
