# Demo workspace and accounts

The seed creates **Tranzora Demo Logistics**, a separate workspace with 8 role accounts and 140 linked operational records. The dashboard, forms and tables load this persisted PostgreSQL data through the real API.

## Seed locally

```powershell
docker compose -f compose.infrastructure.yml up -d --wait
dotnet run --project backend/Tranzora.Api -- --environment Development --migrate
npm run seed:demo
```

Start the API and frontend following README.md, then open http://localhost:3000/login. Seeding is opt-in and never clears the database. Public seeding requires the explicit production settings below.

For an already built full local Compose stack:

```powershell
docker compose --env-file .env.example run --rm api1 --environment Development --seed-demo
```

Use the same environment file/database credentials as the running stack. This one-off Development override does not change the running API instances.

## Sign-in credentials

Local Development accounts use the documented development fixture password. Public deployments require a private configured password and reject the development default.

| Role | Email | Main workflow |
| --- | --- | --- |
| Super Admin | superadmin@demo.tranzora.test | Reserved platform-operator demonstration account; keep private |
| Business Admin | admin@demo.tranzora.test | Workspace administration |
| Manager | manager@demo.tranzora.test | Operations and reports; no user/workspace administration |
| Accountant | accountant@demo.tranzora.test | Customers, suppliers, invoices, payments, expenses and income |
| Dispatcher | dispatcher@demo.tranzora.test | Bookings, trips, fleet, drivers and customers |
| Driver | driver@demo.tranzora.test | Own workspace, assigned trips and vehicles, profile and security |
| Support Staff | support@demo.tranzora.test | Support tickets, notifications and customer lookup |
| Viewer | viewer@demo.tranzora.test | Read-only operational data and reports |

Roles are enforced by the API. The demo Driver account is linked to Rafiq Ahmed's operational driver record and sees only that driver's assignments and vehicles. Administrators can link other Driver accounts in user management. Remove or deactivate accounts with known demo credentials before making a seeded database public.

## Included records

| Module | Count | Scenarios |
| --- | ---: | --- |
| Customers | 12 | Active and inactive |
| Suppliers | 4 | Active and inactive |
| Drivers | 6 | Five active, one inactive; future license expiry |
| Vehicles | 8 | Six active, one in maintenance, one inactive |
| Bookings | 18 | Completed, confirmed, pending and cancelled |
| Trips | 12 | Six completed, two in progress, four scheduled |
| Invoices | 10 | Eight issued, one draft, one cancelled |
| Payments | 8 | Full, split and partial payments; unpaid balances |
| Fuel entries | 12 | Linked to completed trips and their actual vehicles |
| Expenses | 12 | Toll, parking and allowances; no duplicate fuel/maintenance costs |
| Other income | 6 | Handling service income separate from invoice receipts |
| Maintenance | 6 | Scheduled, completed, in progress and cancelled |
| Document metadata | 10 | Active and expired metadata linked to vehicles/drivers |
| Notifications | 12 | Read and unread |
| Support tickets | 4 | Three open, one closed |

Creation uses the operational use cases and relational rules in one transaction. Inserts create audit events; a changed seed increments the shared cache revision. Sessions, reset tokens, idempotency responses and SMTP messages are not fabricated.

An untouched seed has receipts of **BDT 160,250**, expenses of **BDT 104,390**, cash surplus of **BDT 55,860**, and outstanding invoices of **BDT 82,500**. These are cash summaries, not double-entry financial statements.

Documents contain metadata/object keys only; PDFs are not uploaded. External billing, GPS, subscriptions, payroll and file delivery are not simulated. Google/Microsoft sign-in requires real provider credentials; demo identities are not linked to real external accounts. See [OAuth setup](backend.md#google-and-microsoft-sign-in).

## Repeatability and verification

The workspace has a stable ID and records have unique `DEMO-*` references. Reruns create missing records and preserve existing passwords, roles, statuses and edited data. They do not duplicate payments. Recreating deleted fixtures can fail if their related records were changed; the whole run rolls back instead of forcing changes through.

Dates are relative to UTC on the first run and remain unchanged on reruns. Scheduled fixtures eventually become historical unless updated through the application.

With the API running, verify the original credentials, counts, relationships, balances and role restrictions:

```powershell
npm run test:demo
```

This test expects the original demo credentials, counts and financial fixtures. Trip progress may change: dashboard trip counters are checked against the current stored trip statuses. Normal integration tests create separate workspaces and do not require a demo seed.

## Public Render demonstration workspace

This creates a separate demo workspace, not records inside your existing business workspace. The Business Admin is its owner; the Super Admin fixture is reserved for the platform operator. Never distribute operator credentials to customers.

In the combined Render service, set these private environment settings:

- `DemoSeed__AllowProduction=true`
- `DemoSeed__Password`: choose a unique private password of 16?128 characters with letters, numbers and a symbol; do not use the published development password.
- `SEED_DEMO_ON_DEPLOY=true`
- `RUN_MIGRATIONS=true`

Deploy the commit containing this feature. The startup command applies migrations, seeds in a single transaction and then starts the API and frontend. No secrets are printed. Check the seed result for created/preserved counts. After the successful deployment, remove `SEED_DEMO_ON_DEPLOY`, `DemoSeed__AllowProduction`, and `DemoSeed__Password` and redeploy. Do not change ASPNETCORE_ENVIRONMENT to Development on the public site.

All eight listed email accounts are created with the configured password only if missing. Existing account passwords, roles and status are preserved; changing the seed password does not reset them. Use each account's password-change screen to assign distinct passwords before sharing access. Mail to `.test` fixture addresses cannot be delivered; these accounts use password sign-in, not Google OAuth.

The seeded workspace is visible only to its members. Sign in using `admin@demo.tranzora.test` to inspect it. Your existing Google account stays in its original workspace. No anonymous seed endpoint is exposed. Keep the database and Data Protection certificate settings unchanged.

For an isolated production-seed verification, the integration test accepts `DEMO_TEST_PASSWORD` and `TEST_API_URL` from its process environment. Do not run the mutable fixture tests against a shared public demo workspace.
