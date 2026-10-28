# Tranzora Transport Business Management Platform

Next.js frontend with a C# / ASP.NET Core 10 Web API, PostgreSQL, EF Core, Redis caching, and an Nginx load balancer. The backend follows Domain, Application, Infrastructure, and API project boundaries.

MongoDB has been removed from the application, dependencies, environment template and Compose configuration. Existing MongoDB data is not automatically imported or deleted.

## Full local stack

Install Docker Desktop, then run from the repository root:

```powershell
Copy-Item .env.example .env
Copy-Item .env.example .env.local
npm install
docker compose up --build
```

Open http://localhost:3000 and register a workspace. Passwords require 8-128 characters with at least one letter, one number and one symbol. Compose starts PostgreSQL and Redis, applies EF migrations in a separate job, and starts two API replicas, the Next.js frontend, and Nginx. Database data persists in a Docker volume.

The default password and HTTP cookies are for local development. For deployment, set a strong POSTGRES_PASSWORD, a public HTTPS AUTH_URL, and APP_SECURE_COOKIES=true; configure TLS and trusted proxy addresses as described in the operations guide.

## Native development

Requirements: Node.js, .NET 10 SDK, and Docker for local PostgreSQL/Redis (or equivalent installed services).

```powershell
Copy-Item .env.example .env.local
npm install
docker compose -f compose.infrastructure.yml up -d
$env:ASPNETCORE_ENVIRONMENT='Development'
$env:ConnectionStrings__Redis='localhost:6379'
dotnet run --project backend/Tranzora.Api -- --migrate
dotnet run --project backend/Tranzora.Api --urls http://localhost:5080
```

In a second terminal:

```powershell
npm run dev
```

Use localhost consistently. If you use another origin, update AUTH_URL in .env.local and App__PublicOrigin for .NET to match it. ConnectionStrings__Postgres overrides the local database connection. No browser-visible API secret or database connection string is needed.

## Working modules

For a populated workspace with all eight roles, run `npm run seed:demo` after applying migrations. Credentials and scenarios are in [docs/demo-data.md](docs/demo-data.md). Seeding is development-only and safe to rerun without duplicating payments or resetting passwords.

Customers, suppliers, vehicles, drivers, bookings, trips, maintenance, fuel, expenses, other income, invoices, payments, document metadata, support tickets and notifications use persistent APIs. User management, workspace/profile editing, password changes, authentication and audit trails also use the backend. Dashboard totals come from the database. Record forms and tables use server-side validation, search and pagination.

Requests use tenant isolation, foreign keys, unique indexes, decimal money, transactional writes, idempotency keys, version checks and audit events. Redis read caches are scoped to workspace/role/revision and fall back to PostgreSQL when unavailable. Shared sessions and rate limits work across API instances.

Google and Microsoft sign-in are implemented but require your provider app registrations and API credentials before activation. See [OAuth setup](docs/backend.md#google-and-microsoft-sign-in). Some original screens describe planned integrations. GPS, external payment gateways, subscriptions, file delivery, payroll and configurable permission editing are not implemented; the UI no longer reports simulated success for these features. Dashboard financial figures are cash summaries, not full accounting statements. See docs/backend.md for exact coverage and limitations.

## Verification

```powershell
dotnet build backend/Tranzora.Api
npm run typecheck
npm run build
npm run test:integration
```

Integration tests require a migrated API at http://localhost:5080 and create test workspaces in its database. Set TEST_API_URL to target another server, or TEST_API_URLS to comma-separated API addresses to test shared state across replicas. Use a dedicated test/development database.

GET /api/health checks database readiness through the frontend. Native API probes are GET /health/live and GET /health/ready. In Development, API documentation is available at /openapi/v1.json.

## Structure

- backend/Tranzora.Domain — entities
- backend/Tranzora.Application — use cases, validation, permissions and contracts
- backend/Tranzora.Infrastructure — EF Core, migrations, persistence and outbox
- backend/Tranzora.Api — HTTP API and request pipeline
- components/AppScreen.tsx — authentication and application shell
- components/WorkspaceShell.tsx — role-aware navigation, responsive drawer and glass navbar
- components/DriverWorkspace.tsx — assigned trips, vehicles and driver status actions
- app/workspace.css — shared glass surfaces, depth effects and light/dark responsive styling
- components/OperationsWorkspace.tsx — API-backed screens and forms
- lib/api-client.ts — browser API and command retry helpers
- lib/auth.ts — server-rendered page authentication against .NET
- app/api/[...path]/route.ts — same-origin proxy for native development
- deploy/nginx.conf — two-replica API load balancing
- docs/backend.md — API contracts, retry protocol, consistency and deployment details
- docs/user-manual.md — day-to-day operating procedures: booking to payment, fleet, roles, and what is not wired up

## Public deployment

Release repository: https://github.com/Yarafat2001/Tranzora_Transport_Live

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yarafat2001/Tranzora_Transport_Live)

The Blueprint provisions a public web service, private API, PostgreSQL and Key Value. Review the paid-resource estimate and enter SMTP values privately in Render. This button starts setup; it does not mean the application is already deployed. Follow [deployment and acceptance steps](docs/render-deployment.md). Production does not automatically create demo accounts or import local business data.