# Public delivery on Render

This is a new deployment. No public service has been created by this session.

## Prepared layout

`render.yaml` defines a public Next.js Docker web service, a private .NET Docker API, private PostgreSQL 18 and private Redis-compatible Key Value, all in Singapore. Only the web service is public. The API runs migrations as a pre-deploy step; normal startup never changes the schema. Resource plans are paid: review Render's displayed estimate before creating them.

The web service obtains the API's private host/port automatically. The API accepts Render's PostgreSQL/Redis URLs. The public origin is taken from the web service's Render URL, and production cookies are Secure and HttpOnly. Do not replace this origin with an unrelated site. For a custom domain, set `AUTH_URL` and `App__PublicOrigin` to that same HTTPS origin.

## Deployment steps

1. In Render select New > Blueprint and connect `Yarafat2001/Tranzora_Transport_Live`, branch `main`, using `render.yaml`. Alternatively open https://render.com/deploy?repo=https://github.com/Yarafat2001/Tranzora_Transport_Live .
2. Review the resources and cost estimate. Approve resource creation only after accepting those costs. Review any Blueprint validation errors before deploying.
3. Enter SMTP Host, From, Username and Password privately when prompted. The API uses port 587 and STARTTLS. Do not paste credentials into commits, chat, screenshots or documentation.
4. Let the API's pre-deploy migration finish. Wait for the public web service's `/api/health` to return HTTP 200. A successful home page alone does not prove the database/API works.
5. Register the real owner through the public registration page. Registration creates a Business Admin workspace owner. Do not run the development demo seed against production.
6. Sign in, create a customer, vehicle and licensed driver, then a booking and non-overlapping trip. Complete the trip workflow, issue an invoice and record a bounded payment. Verify the resulting cash summary and audit trail. Repeat access checks with a Viewer and a separate organization.
7. Request a reset email for the real registered account. Confirm receipt, reset successfully, then verify that reusing the same link fails. A reset link expires after 30 minutes.
8. Test phone/desktop, both themes, Bengali switching and the language icon menu at the real public URL.

## Recovery gate

Render manages WAL/PITR for its paid PostgreSQL service. Its documented recovery window is three days on a Hobby workspace and seven days on Pro or higher. To satisfy the requested seven-day recovery requirement, use an appropriate paid database plus a Pro-or-higher workspace and verify the Recovery page. Free PostgreSQL has no managed recovery coverage.

https://render.com/docs/postgresql-backups

Create and export a logical backup from the Recovery page, and rehearse recovery into a separate database before client acceptance. Download exports to protected independent storage. The local Compose backup overlay is not a Render managed-Postgres backup service and must not be represented as one. Scheduled offsite logical exports for Render still require a configured backup destination/job; they are not provisioned by this Blueprint.

## Optional Google/Microsoft sign-in

Password sign-in and recovery work independently of OAuth. Provider buttons remain disabled unless the API has valid provider registrations. Before enabling public provider sign-in, configure an encryption certificate for the shared OAuth key ring using a Render secret file, its path/password settings, and the provider credentials. Add the exact public `/api/auth/callback/google` or `/api/auth/callback/microsoft` URI in the corresponding provider console. Local callback registrations do not authorize the public callback. Never weaken the certificate requirement to make deployment start.

## What remains external

The Render account must authorize repository access, resource billing and private secret values. A real public SMTP reset, public TLS/callback verification and managed-database restore rehearsal cannot be claimed before deployment. CI files are supplied but a remote green branch and deliberately failing branch have not yet been demonstrated.

The broader work-package list is not all implemented: OpenTelemetry/metrics, audit export retention, new financial analytics, automated reminders, narrowed tenant locking, public enquiries/status links, private document delivery, PDF/payment integrations, MFA and all advanced reporting require additional scoped implementation and validation. Do not advertise these as completed features.

## Rollback

Keep the prior successful image/deploy available. If a new deploy fails, leave traffic on the previous healthy version. Never roll back by dropping the database or deleting its volume. Before changing database targets, verify restore counts and a known invoice amount. For a bad data change, create a separate recovery instance and validate it before switching connections.


## Approved production role policy

The owner confirmed on 28 October 2026 that registration must create a Business Admin owner. Super Admin is reserved for platform operators; workspaces do not receive an automatic Super Admin. This decision supersedes the conflicting checklist requirement for a Super Admin in every workspace. Existing registration and role-enforcement tests enforce this policy.
