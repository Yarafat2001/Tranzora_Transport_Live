# Backend design and operations

The frontend is Next.js/TypeScript. The backend is ASP.NET Core 10/C#, EF Core, PostgreSQL, and optional Redis. Next.js does not access the database. Native development uses a same-origin proxy in `app/api/[...path]/route.ts`; Compose routes `/api` directly through Nginx to two API replicas.

## Responsibilities

| Project | Responsibility |
| --- | --- |
| Tranzora.Domain | Tenant, identity, operational and audit entities |
| Tranzora.Application | Use cases, field validation, permission policy, service contracts |
| Tranzora.Infrastructure | EF mappings, queries, identity persistence, SMTP outbox, maintenance |
| Tranzora.Api | HTTP contracts, session authentication, request protection, transactions, replay and cache coordination |

One backend deployment contains all modules. The database holds shared sessions, rate limits, idempotency results and cache revision numbers. Sticky sessions are unnecessary. Redis stores disposable read results, never authentication or payment truth.

## Implemented API

Driver accounts have their own scoped workspace: `GET /api/v1/driver`, paginated `GET /api/v1/driver/trips`, and `PUT /api/v1/driver/trips/{uuid}`. Administrators link an account's nullable `driverId` to a driver in the same organization through user creation/access management. A unique composite foreign key relationship prevents cross-tenant links or sharing one driver across multiple accounts. Drivers can start their assigned scheduled trips and complete their own trips in progress; writes require the same version/idempotency protections as other mutations. They cannot access the general fleet, customer or finance APIs.

The shared frontend shell renders permitted navigation from the server session, includes profile/security for every role, and redirects drivers to `/driver`. It supports mobile drawer focus management, a compact desktop sidebar, keyboard search, light/dark themes and reduced motion. Run `npm run test:ui` with Chrome installed and the app running at `TEST_WEB_URL` (default `http://localhost:3001`) to check every sidebar destination for all eight roles. `npm run test:driver` verifies assignment isolation and trip transitions through the API.

All browser calls use the application's origin.

| Endpoint | Behavior |
| --- | --- |
| POST /api/auth/register | Organization, owner, password hash and session in one transaction |
| POST /api/auth/login | Password verification, shared account lockout and session |
| GET /api/auth/session | Current active user, role and organization |
| POST /api/auth/logout | Revoke the database session and cookie |
| POST /api/auth/forgot-password | Queue a 30-minute recovery link; requires SMTP configuration |
| POST /api/auth/reset-password | Consume recovery token and revoke sessions atomically |
| GET /api/v1/schemas | Allowed resources, fields, required values, statuses and write access |
| GET /api/v1/{resource} | Tenant-scoped, filtered, paginated records |
| GET /api/v1/{resource}/{uuid} | Record and strong version ETag |
| POST /api/v1/{resource} | Validate and persist a record |
| PUT /api/v1/{resource}/{uuid} | Partial field update with optimistic concurrency |
| DELETE /api/v1/{resource}/{uuid} | Delete an eligible unreferenced record |
| GET /api/v1/dashboard | Workspace cash totals, outstanding invoices and operational counts |
| GET /api/v1/audit-logs | Paginated mutation audit trail |
| GET/PUT /api/v1/profile | Current user's name and phone |
| GET/PUT /api/v1/settings | Workspace name; currency remains fixed per workspace |
| GET/POST /api/v1/users | Administrator user listing and creation |
| PUT /api/v1/users/{uuid} | Administrator role/status changes; revoke target sessions |
| POST /api/v1/password | Change current password and revoke sessions |
| GET /health/live | Process liveness without database dependency |
| GET /health/ready | Database connectivity and applied migration check |
| GET /api/health | Browser-facing readiness alias |
| GET /openapi/v1.json | ASP.NET OpenAPI document in Development |

Resources: customers, suppliers, drivers, vehicles, bookings, trips, maintenance, fuel, expenses, income, invoices, payments, documents, notifications, support. These have separate relational tables. Users and audit logs have dedicated endpoints; credentials are never returned.

`page` defaults to 1 and is bounded at 10000. `pageSize` defaults to 20 and is bounded at 100. `search` matches literal substrings in name/reference, at most 100 characters. `status` uses the resource's schema values. Ordering is creation time descending, then UUID descending for deterministic ties. Offset pagination is suitable for these management screens; it is not a snapshot across concurrent inserts. Introduce cursor pagination if measured volumes warrant it.

## Mutation protocol

Send `X-Tranzora-Request: 1` on every mutation. Send JSON for non-DELETE mutations. Browser origins must match `App:PublicOrigin`; the API does not enable cross-origin credential access.

All `/api/v1` mutations also require `Idempotency-Key` (8–128 ASCII letters, digits, `_` or `-`). PUT/DELETE records require `If-Match: "<version>"`. Read the current version before editing; a stale edit returns 412, a missing version returns 428.

The key scope includes organization, user, method and path. The fingerprint includes query, request body and If-Match. A successful response, its ETag and Location are stored in the same PostgreSQL transaction as business records, audit and cache revision. The response is buffered until commit. A matching retry returns the original status/body with `Idempotency-Replayed: true`. A different fingerprint returns 409. Failed mutations are rolled back and are not stored as successful replays. Retention is 24 hours; clients must not retry indefinitely beyond that window. This provides deduplication within the retained scope, not an unlimited exactly-once guarantee.

The frontend keeps a fingerprint and random command key in sessionStorage, so unchanged retries in the same tab reuse the key. It does not persist form content or credentials there. After an ambiguous timeout, retry with the same key and body. If browser storage is unavailable, API callers should explicitly retain their own key; UI retries cannot guarantee persistence in that case.

## Consistency and business rules

* Tenant identity comes from the authenticated database session, never an input organization ID. Read-only/unknown fields are rejected.
* Composite foreign keys `(related_id, organization_id)` prevent references across tenants, including direct database writes.
* Unique indexes protect tenant references, vehicle registrations, driver licenses and normalized account emails.
* Mutations lock the tenant organization row. This deliberately serializes writes within one workspace, covering payment balance checks, trip overlap checks, replay races and workspace changes across replicas. Different tenants can write independently. This conservative design trades per-tenant write throughput for simple correctness. Benchmark before replacing it with finer locks and stronger scheduling constraints.
* Record versions prevent silent lost updates. Updates increment versions; financial entries are immutable.
* Trip assignment checks booking availability, active driver/vehicle, license expiry and overlapping booking/driver/vehicle intervals. Time boundaries are half-open: a trip can start when another ends.
* Payments require issued invoices and cannot exceed the outstanding balance. Invoices with payments cannot change. Financial and completed records cannot be deleted.
* Fuel and expense vehicle references must match their linked trip. Invoice customers must match trip customers.
* Money uses PostgreSQL numeric(18,2) and C# decimal, with nonnegative bounded input, not binary floating point in persistence. The UI is a single-currency workspace.
* Dashboard figures are cash summaries, not double-entry accounting. Invoice payments and other income are distinct sources. Fuel, completed maintenance and other expenses are distinct cost sources; entering a fuel cost again as an expense will double count it.

## Caching and rate limiting

Lists and dashboard aggregates use a 30-second distributed cache. Keys include tenant, role, committed workspace revision and query fingerprint. Every committed mutation increments the revision, so subsequent requests avoid pre-mutation cache entries across replicas. An in-flight read can still return the snapshot it began loading; caching does not promise linearizable reads. Redis failures fall back to database reads. With no Redis connection, development uses process-local memory while database revisions still prevent stale keys after committed writes.

Shared PostgreSQL fixed-window limits allow 30 anonymous requests/minute/IP and 180 authenticated requests/minute/user across replicas. Login also locks an account for 15 minutes after five failed attempts. The BFF is a shared client IP in native development, so anonymous limits are shared there; Compose sends API traffic directly through the trusted Nginx edge. An outer production ingress can add an additional edge limit.

## Google and Microsoft sign-in

The API uses ASP.NET authentication handlers with authorization code flow, PKCE, protected state and correlation cookies. No provider access tokens are saved. Existing users sign in with a password, then connect a provider from **My profile** within 10 minutes of signing in. Matching email addresses never automatically link accounts. Subsequent provider logins retain the existing database role and organization. Disconnecting a provider revokes other sessions.

A new provider identity completes the registration form with workspace details and a strong backup password. Both sign-up paths, email and password or a provider, create a new workspace whose owner account has the Business Admin role; Super Admin stays reserved for platform operators and demo data. Enrollment and linking grants expire after 10 minutes, are stored hashed, and are consumed transactionally once. Organization administrators still create invited staff accounts; social sign-up does not join an existing workspace merely by matching a domain.

Live sign-in cannot be enabled without registrations in accounts you control. No real client credentials are supplied in this repository, and unconfigured buttons are disabled. For the current development URL, follow these steps:

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), create/select a project, configure Branding and Audience, and create a **Web application** OAuth client. Set the authorized redirect URI to `http://localhost:3000/api/auth/callback/google` — the exact origin you type in the browser for the app, port included. Request only basic profile/email access. While the app is in Testing, add every tester to its test-user audience; publish the consent configuration before making it generally available, completing any verification Google requires.
2. Open [Microsoft Entra app registrations](https://entra.microsoft.com/), register an application supporting **Accounts in any organizational directory and personal Microsoft accounts**. Add a **Web** redirect URI `http://localhost:3000/api/auth/callback/microsoft`. Use delegated `User.Read` permission; create a client secret and copy its **value**, not its secret ID. Tenant policies can require administrator consent. The current handler uses Microsoft's common authority for organizational and personal accounts.
3. Set API configuration `Authentication__google__ClientId`, `Authentication__google__ClientSecret`, `Authentication__microsoft__ClientId`, and `Authentication__microsoft__ClientSecret` using a secret store or your local process environment. Never put secrets in `NEXT_PUBLIC_*` variables or commit them. Compose uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` from its root `.env`/process environment. Next's `.env.local` does not configure the .NET container.
4. Set API `App__PublicOrigin=http://localhost:3000`, `App__SecureCookies=false` for local HTTP, and Next `AUTH_URL=http://localhost:3000`. Restart the API after changing credentials. The origin in your address bar, `App__PublicOrigin`, `AUTH_URL` and the registered callback URI must all name the same host and port: `next dev` quietly moves to 3001 when 3000 is busy, and a stale value on either side makes Google answer `Error 400: redirect_uri_mismatch`. The BFF and load balancer use the public origin for both authorization and token-exchange callback URLs.
5. For production, register separate HTTPS callback URIs for your real domain, use secure cookies, remove demo accounts from production, and rotate credentials before expiry. All replicas share the PostgreSQL Data Protection key ring and application name. Public OAuth deployments require a PFX certificate through `Authentication__KeyEncryptionCertificatePath` / `Authentication__KeyEncryptionCertificatePassword` to protect that key ring at rest. Mount it read-only in every API replica and migration job, restrict database/backup/certificate access, and retain old decryption certificates during rotation. Compose exposes the path/password settings but the deployment must provide the certificate mount.

`GET /api/auth/providers` reports configuration presence, not a successful credential validation. Test real accounts from both providers after registration, including a restricted Microsoft tenant and a Google test user. `npm run test:oauth` starts two local API instances (5082/5083) plus a mock identity service (5095) against the migrated test database. It exercises the real provider handlers, PKCE, shared state across replicas, email collision protection, session-bound linking, enrollment replay, stable identity IDs and disconnect revocation. Set `TEST_POSTGRES` for a dedicated test database. Test records are retained. Mock endpoint overrides are rejected outside the Testing environment and loopback.

## Deployment

Set the public origin consistently in Next.js and .NET. Use HTTPS and secure cookies in production. Compose's plaintext HTTP mode is for local development. Terminate production TLS at the ingress and configure the immediate trusted proxy address in `App:KnownProxies`; never trust arbitrary forwarded headers. The supplied Nginx overwrites client-supplied forwarding headers and uses least connections across two API instances. Its `max_fails` policy is passive failure detection; `/health/ready` is available for an orchestrator's active readiness checks. Nginx does not enable retrying non-idempotent requests.

Migrations run in a one-off `migrate` service before API replicas start. They do not run during ordinary request startup. Deployments should use separate migration and runtime database credentials with appropriate privileges. PostgreSQL and Redis have no public ports in the full Compose stack. The optional infrastructure-only file binds dependency ports to loopback for native development.

SMTP uses `Smtp__Host`, `Smtp__Port`, `Smtp__From`, `Smtp__Username`, `Smtp__Password`, and `Smtp__EnableSsl`. Password recovery tokens are stored hashed; queued email necessarily contains its delivery link. Restrict database/outbox access. Workers claim mail with `FOR UPDATE SKIP LOCKED`, retry with backoff up to eight attempts, then retain the item for operator inspection. SMTP delivery is at least once, so a crash after send can produce a duplicate email. Expired sessions, rate buckets, recovery tokens and replay results are cleaned periodically. Add monitoring/alerting around worker errors and exhausted mail attempts before public rollout.

Back up PostgreSQL with `pg_dump --format=custom` to protected external storage; test restores into a separate database. Container volume persistence is not a backup. Configure managed database point-in-time recovery for production. Do not expose database repair/drop controls through the web UI.

## Verification

An optional development seed populates every supported role and operational module. Run `npm run seed:demo` after migrations; see [demo-data.md](demo-data.md) for credentials, scenarios and repeatability guarantees. `npm run test:demo` verifies the populated workspace through the API.

Run frontend type checking/build and `node --test tests/backend.integration.mjs` with a migrated, running API. Tests create isolated workspaces and retain their records for inspection; use a dedicated development/test database. To exercise shared state across two instances:

```powershell
$env:TEST_API_URLS='http://localhost:5080,http://localhost:5081'
npm run test:integration
```

Tests cover session handling, CSRF header enforcement, concurrent duplicate replay, key/body conflicts, uniqueness, pagination, tenant isolation, stale version rejection, trip overlap, foreign-key deletion protection, concurrent overpayment prevention, audit deduplication, role enforcement and logout.

## Remaining product integrations

Live GPS, payment gateway webhooks, subscriptions, file upload/download delivery, configurable role-policy editing, tax accounting, financial reversals/credit notes, payroll, and scheduled report delivery are not implemented by this migration. Documents store metadata/object keys, not uploaded file contents. Notifications are persisted records, not a push delivery service. Reports currently display live workspace summaries and relevant entity lists, not the former fabricated charts. Unsupported screens explicitly describe their configuration/status; they do not simulate completed actions.

Passing local tests does not establish production readiness. Before a public release, provision and validate provider credentials and SMTP, enforce HTTPS, disable/remove demo access, test backup restoration, set monitoring and alerts, perform workload/load testing and review authentication/authorization independently. Email verification and MFA are not currently implemented. Choose whether those are required for your threat model before launch. No production domain or infrastructure is configured by this repository.

No automatic import of old MongoDB users or business data is performed. The removed MongoDB driver and services are not needed to run this system; existing external databases/volumes are not deleted. Inventory/export any legacy data before retiring it.

## Backup restore rehearsal

See [backup-restore.md](backup-restore.md) for the verified isolated logical restore and its matching row counts and invoice amount. Automated scheduling, retention and WAL recovery remain pending; this is not production backup coverage.

## Local SMTP activation

The local standalone API loads SMTP configuration from the ignored .env.smtp-api file alongside its existing ignored runtime environment file. Do not print either file or commit their contents. Preserve both environment-file arguments when recreating the local container; production must configure SMTP through its own secret settings. SMTP uses port 587 with STARTTLS and the existing eight-attempt outbox worker. The previous API container is retained for rollback. A successful reset request intentionally says nothing about whether an account exists; only active existing accounts queue recovery messages. A labelled delivery test does not prove password-reset completion.


## Reset-password layout

Reset-password presentation uses a route-scoped CSS module to avoid inheriting the two-column sign-in layout. API calls, token handling, validation and password reset semantics are unchanged.

## Browser branding

Root app icon assets use the existing Tranzora truck mark. Next.js generates icon metadata, including a versioned SVG URL; the favicon.ico fallback and Apple touch icon also use this branding.

## Interface language

A shared client LanguageProvider stores en/bn in the browser's tranzora-language preference and updates the document language. A reviewed local Bengali dictionary translates interface labels only; no text is sent to a translation service. Role/status option values, resource identifiers, API payloads and permission checks remain canonical English. Missing translations fall back to the source wording. Language switching does not reload the route or reset form state.


## Language icon and landing illustration

The language icon opens an accessible radio menu with keyboard navigation and outside-click dismissal. Landing-page tablet charts and route map are decorative illustrations, labelled as not live telemetry; no tracking provider or data integration is added. Reduced-motion preferences disable the new trail and route animations.

## Delivery preparation

See [render-deployment.md](render-deployment.md) for the new Render deployment, managed-recovery requirements and public acceptance gates, and [backup-restore.md](backup-restore.md) for demonstrated local WAL recovery. DATABASE_URL and Redis URL parsing support Render private datastore references. The BFF bounds chunked bodies while reading, rejecting oversized input with 413; browser responses add no-referrer, anti-framing and MIME-sniffing protections. Readiness returns mail queue counts only to authenticated administrators and only for recipients in their organization. CI uses PostgreSQL/Redis services and builds both application Dockerfiles. A clean install now includes the declared browser-testing dependencies.


## Approved production role policy

The owner confirmed on 28 October 2026 that registration must create a Business Admin owner. Super Admin is reserved for platform operators; workspaces do not receive an automatic Super Admin. This decision supersedes the conflicting checklist requirement for a Super Admin in every workspace. Existing registration and role-enforcement tests enforce this policy.


Responsive UI adjustment (28 October 2026): shared search focus and landing/header sizing are CSS-only; backend contracts and authorization are unchanged. .NET build and TypeScript passed; isolated release API integration passed 12 checks. The older development API on port 5080 lacks the newer health diagnostics response and should not be used to validate that release check.


English typography is supplied as local static font assets through app/typography.css; this changes no API contracts or authentication behavior.

Vercel/Render origin, credentialed CORS and cookie configuration: see [vercel-render-auth.md](vercel-render-auth.md). One configured API origin list now drives CORS and CSRF checks; SameSite=None requires Secure cookies.

Render runtime correction (29 October 2026): both Docker runtime stages install libgssapi-krb5-2 and verify that libgssapi_krb5.so.2 is registered. The combined-service script clears inherited HTTP_PORTS/HTTPS_PORTS when binding its API explicitly, preventing the harmless port-override warning. SDK compilation includes WebSecurity.cs, EndpointExtensions.cs and SchemaMigrations.cs; use the repository-root Tranzora.sln in VS Code and reload the window if its cached generated solution still reports missing types.


The endpoint-extraction regression also omitted dashboard and audit-log routes. Both routes are restored in EndpointExtensions with their existing tenant and permission checks; the existing API integration suite covers totals and audit behavior.

## Google sign-in and registration actions

The live provider status endpoint reported Google and Microsoft disabled on 29 October 2026. Changing a button does not activate a provider. Availability is checked before starting provider navigation; unavailable providers now show a focused, visible explanation instead of an inert control. Failed availability checks are distinguished from missing configuration. Registration/login navigation remounts the auth form so notices and submission state do not leak between pages. Registration failures are shown above the form and brought into view.

To activate Google on the Render origin, configure the existing Google Web OAuth client with this exact authorized redirect URI:

`https://tranzora-transport-live.onrender.com/api/auth/callback/google`

The API requires these private Render settings: `Authentication__google__ClientId`, `Authentication__google__ClientSecret`, one of `Authentication__KeyEncryptionCertificate` or `Authentication__KeyEncryptionCertificatePath`, and `Authentication__KeyEncryptionCertificatePassword`. Use `Authentication__KeyEncryptionCertificate` on Render: set it to the single-line base64 of the PFX file as a secret environment value. Render secret files are stored as text, so a binary PFX uploaded there loses bytes and the API dies at startup with `CryptographicException: ASN1 corrupted data`. `Authentication__KeyEncryptionCertificatePath` remains available for deployments that can mount the file, such as the Compose setup, where the path must point at a readable PFX. Do not put the certificate or its password in Git. Use `App__PublicOrigin=https://tranzora-transport-live.onrender.com`, `AUTH_URL=https://tranzora-transport-live.onrender.com`, and `App__SecureCookies=true`. Public provider activation is intentionally refused without key-ring encryption configured.

After setting the configuration and redeploying, `/api/auth/providers` must report `google` enabled. This confirms configuration presence, not a complete Google login. Verify a real provider round trip before accepting activation. The Google console's consent/testing settings must allow the intended account. No Google secret values were read or changed during the UI fix.

The same live check still reported pending migration `20261028143924_InitialCreate` at `/api/health`. Complete the migration step and obtain HTTP 200 before accepting email registration; the login page alone does not prove readiness. The Register here link was verified to open the live registration form on phone and desktop without submitting public data.


IDE diagnostics correction (29 October 2026): C# Dev Kit logged a lost project-system JSON-RPC connection, and the C# language server subsequently loaded API files through FileBasedProgramsProjectSystem. These are project-based sources, not standalone C# apps. The repository now includes Tranzora.sln with the four application projects; workspace settings select it and disable file-based-program discovery. backend/Tranzora.slnx remains valid for existing CLI/CI commands. Full rebuilds succeeded with zero warnings and errors; WebSecurity, SchemaMigrations and endpoint helpers remain required. Run Developer: Reload Window and use the real root solution rather than the generated AppData solution.
