# Vercel frontend and Render API: origin and cookie configuration

The message `Request origin or CSRF header is invalid.` is emitted by `app/api/[...path]/route.ts` before the request reaches Render. The API separately rejects requests without `X-Tranzora-Request: 1` or from untrusted origins in `backend/Tranzora.Api/ApiMiddleware.cs`.

## Vercel environment variables

Set these for Production, then redeploy (NEXT_PUBLIC values are compiled at build time):

| Variable | Value |
| --- | --- |
| AUTH_URL | https://tranzora-transport-live.vercel.app |
| APP_ALLOWED_ORIGINS | https://tranzora-transport-live.vercel.app |
| NEXT_PUBLIC_API_URL | https://tranzora-transport-live.vercel.app/api |
| BACKEND_URL | Your Render API's HTTPS origin, without `/api` or a trailing path |

Browser requests use NEXT_PUBLIC_API_URL. The `/api` proxy forwards them to BACKEND_URL and forwards the API's HttpOnly Set-Cookie response to the browser on the Vercel domain. This is intentional: server-rendered page guards read the Vercel-domain cookie. Setting NEXT_PUBLIC_API_URL directly to the Render origin can set a cookie only for Render; it will not authenticate those server-rendered page guards. A direct browser-only API client would require a separate session architecture and may face third-party cookie restrictions. Do not copy a Render-domain cookie into JavaScript/localStorage.

## Render API environment variables

| Variable | Value |
| --- | --- |
| App__PublicOrigin | https://tranzora-transport-live.vercel.app |
| App__AllowedOrigins__0 | https://tranzora-transport-live.vercel.app |
| App__SecureCookies | true |
| App__CookieSameSite | None |

Redeploy the API after setting them. Keep existing private database/SMTP/provider settings unchanged. `Cors__AllowedOrigins__0` is supported for compatibility, but the preferred allowlist is App__AllowedOrigins. Remove stale legacy entries you no longer trust. Never use `*` with credentialed CORS. Do not add a cookie Domain shared between vercel.app and onrender.com; they are unrelated domains.

`None` emits SameSite=None with Secure; startup rejects None with insecure cookies. Lax remains the default for local HTTP development. The same cookie configuration applies to normal sessions, external enrollment/session cookies and OAuth correlation cookies. Session deletion uses the matching cookie options.

## Verification

.NET build and TypeScript passed. Targeted loopback checks with the configured Vercel origin passed: credentialed CORS preflight, rejected hostile-origin POST, rejected missing CSRF header, and rejected hostile preflight. Client checks passed for configured API base normalization, unsafe URL rejection, credentials inclusion and CSRF header forwarding. The actual BFF handler accepted the configured Vercel origin and rejected hostile origins/missing CSRF headers. Cookie serialization and configuration checks verified HttpOnly/SameSite=None/Secure, rejected insecure None settings, and rejected wildcard trusted origins. Full database integration could not run because Docker Desktop's engine was unavailable. Public authenticated login has not been verified and requires the environment changes and redeployments above.

After redeploying both apps, clear old site cookies and retry login. In Network verify the browser posts to the Vercel `/api/auth/login`, includes X-Tranzora-Request: 1, receives a successful response and an HttpOnly Secure cookie, then `/api/auth/session` returns the same account. Do not capture or publish cookie values.

Production-build browser verification passed on 390px and 1440px in light and dark themes. Intercepted test responses verified CSRF header submission and authentication-error rendering; no live account credentials were used.

