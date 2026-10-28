# Free / 1-month free deployment of Tranzora

## Can I host this for free?

**Render (the documented public deployment) no longer has a free tier.** Render discontinued its free web-service tier in 2024, and the checked-in `render.yaml` intentionally provisions paid resources (paid web + API instances, paid PostgreSQL and Redis). Review Render's cost estimate before using it — there is no "1 month free" Render plan for this stack.

**Free alternatives that work with this repository:**

| Option | Free allowance | Best for |
|---|---|---|
| **Oracle Cloud Always Free** | ARM Ampere A1 VM: up to 4 OCPUs, 24 GB RAM, storage — **no expiry** | Recommended. Runs the whole stack with `compose.free.yml`. |
| AWS Free Tier | 12 months, t2/t3.micro (1 vCPU, 1 GiB) + 30 GB storage | 12-month free trial |
| Azure free account | 12 months popular services + $200 credit (30 days) | 1-month-ish trial |
| Google Cloud free trial | $300 credit, 90 days | Short trial |

This repo now includes `compose.free.yml` (single-host, one API replica) plus `.env.free.example` for exactly this scenario.

## What the stack needs

- **PostgreSQL 18** (required — EF Core database; cannot be dropped)
- **Redis** (used for caches and rate limits; required by the API)
- **.NET API** (ASP.NET Core 10) and **Next.js frontend** (standalone output)
- **SMTP** (required only for password-reset emails; sign-in works without it)
- Optional: Google/Microsoft OAuth credentials for provider sign-in

## Recommended path: Oracle Cloud Always Free

1. Create an Oracle Cloud account and provision an **Always Free Ampere A1 Compute instance** (Ubuntu), up to 4 OCPUs and 24 GB RAM.
2. Open ingress port **3000** (HTTP) in the instance's security list. For HTTPS, put **Cloudflare Tunnel** (free) in front and set `APP_SECURE_COOKIES=true`.
3. Install Docker: `curl -fsSL https://get.docker.com | sh` and add your user to the `docker` group.
4. On the VM:

```powershell
git clone https://github.com/sajibsaj66/Tranzora-Transport-Business-Management-Platform.git
cd Tranzora-Transport-Business-Management-Platform
cp .env.free.example .env
```

5. Edit `.env`:
   - `POSTGRES_PASSWORD` — set a strong password.
   - `AUTH_URL` — `http://<vm-public-ip>:3000` (or `https://<your-domain>` if using Cloudflare Tunnel).
   - `APP_SECURE_COOKIES=true` only if you terminate HTTPS.
   - SMTP values if you want password-reset emails (free SMTP tiers: Brevo, SendGrid, Mailgun).

6. Build and start:

```powershell
docker compose -f compose.free.yml up --build
```

7. Open `http://<vm-public-ip>:3000`, register the workspace owner, then verify `http://<vm-public-ip>:3000/api/health` returns HTTP 200.

## Data persistence on free tiers

- `compose.free.yml` stores PostgreSQL data in the named volume `tranzora_postgres`.
- Oracle Cloud Always Free instances are not automatically backed up. Before stopping or deleting the instance, back up the volume (or export the database with `pg_dump`) — there is no managed point-in-time recovery on free resources.
- The local `deploy/postgres/backup-loop.sh` overlay is for local Compose only and is not a managed backup service.

## Production acceptance on a free/trial host

1. Register the real owner through the public registration page (creates a Business Admin workspace owner). Do **not** run the demo seed on a public instance.
2. Complete one full cycle: customer → vehicle → licensed driver → booking → trip → invoice → payment. Check the cash summary and audit trail.
3. Request a password-reset email (requires SMTP), confirm it arrives, reset, and confirm reusing the link fails (links expire after 30 minutes).
4. Verify `/api/health` returns 200 and both themes plus Bengali switching work at the public URL.

## What to skip on free/trial hosting

- Do not run `npm run seed:demo` on a publicly reachable instance.
- OAuth provider buttons stay disabled until you register provider credentials and the exact public callback URIs (`/api/auth/callback/google`, `/api/auth/callback/microsoft`).
- The Render-specific managed-recovery and cost-estimate steps in `docs/render-deployment.md` do not apply to self-hosted Compose.

## Related files

- `compose.free.yml` — single-host Compose file (this deployment)
- `deploy/nginx.free.conf` — single-replica Nginx gateway config
- `.env.free.example` — environment template
- `render.yaml` / `docs/render-deployment.md` — Render paid deployment (not free)