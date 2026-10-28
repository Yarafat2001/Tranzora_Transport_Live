# Backup and restore verification

## Verified local logical restore — 2026-10-27

A custom-format dump from the running Tranzora PostgreSQL 18 database was restored with `pg_restore --no-owner --no-acl --exit-on-error` into a separate PostgreSQL 18 container, `tranzora-wp1-restore`, database `tranzora_restore`. The scratch container uses `--network none`, exposes no ports, and has no connection to the application. Live records were not modified.

| Table | Source rows | Restored rows |
| --- | ---: | ---: |
| Organizations | 24 | 24 |
| Customers | 26 | 26 |
| Trips | 22 | 22 |
| Invoices | 16 | 16 |
| Payments | 20 | 20 |

Known invoice `DEMO-INV-008`: amount `37500.00` in both databases. These are observations at verification time, not seeded or expected constants.

## Commands used

Run from PowerShell. These commands use the database's local socket and do not read credential files. The source container and database names below apply to the verified local installation only.

```powershell
docker exec tranzora-transport-business-management-platform-postgres-1 pg_dump -U tranzora -d tranzora -Fc -f /tmp/tranzora-wp1.dump
docker run -d --name tranzora-wp1-restore --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18-alpine
docker cp tranzora-transport-business-management-platform-postgres-1:/tmp/tranzora-wp1.dump "$env:TEMP\tranzora-wp1.dump"
docker cp "$env:TEMP\tranzora-wp1.dump" tranzora-wp1-restore:/tmp/tranzora-wp1.dump
# Wait until this reports accepting connections before proceeding:
docker exec tranzora-wp1-restore pg_isready -U postgres
docker exec tranzora-wp1-restore createdb -U postgres tranzora_restore
docker exec tranzora-wp1-restore pg_restore -U postgres -d tranzora_restore --no-owner --no-acl --exit-on-error /tmp/tranzora-wp1.dump
```

Check every command's exit code; stop on failure. Use a fresh scratch container name for a repeat rehearsal. Trust authentication above is limited to this network-isolated disposable scratch container; never use it for the deployed service.

Backups contain sensitive business and identity data. The dump currently remains in the source container's `/tmp`, the operator's temporary directory, and the isolated scratch container. Restrict access and remove these rehearsal copies after verification. None is a committed repository artifact.

## Remaining WP1 work

This proves logical restoration only. Nightly scheduling, seven-day retention, continuous WAL archiving, physical base backups and a WAL recovery rehearsal are not yet implemented or verified. A logical dump cannot serve as the base for WAL recovery. Do not treat this rehearsal as production backup coverage. See PostgreSQL 18 continuous archiving documentation: https://www.postgresql.org/docs/18/continuous-archiving.html.

## Automated physical backup and WAL proof — 28 October 2026

`compose.backups.yml` is an optional overlay for self-hosted Compose. Build and run with `docker compose -f docker-compose.yml -f compose.backups.yml up -d --build`. This changes the PostgreSQL container image/configuration and requires a planned restart; it was not applied to the live development database.

The worker creates a custom-format logical dump and a pgBackRest physical full backup immediately on first run, then nightly after 02:00 UTC. Failed backups retry in five minutes. Logical dumps expire after seven days; pgBackRest's time-based seven-day retention expires physical backups and their dependent WAL safely, retaining a sufficiently old base backup to cover the window. Budget disk for retention plus a new backup. A health check becomes unhealthy if the last success is older than 26 hours. Connect that condition to your monitoring/alerting service.

WAL archives on segment completion, with `archive_timeout=60s`. The repository volume is local protected storage, not an independent/offsite copy. Arrange independent encrypted storage before treating it as disaster-recovery coverage. Never manually expire the WAL directory.

An isolated rehearsal used the same PostgreSQL 18 backup image and a fresh logical copy of the live database. Physical full backup `20261027-232220F` completed; a new `delivery_wal_probe` row was then inserted, WAL was switched and `pgbackrest check` verified archive delivery. `pgbackrest --stanza=tranzora --type=default --archive-mode=off restore` restored into a different empty volume with the backup repository mounted read-only. PostgreSQL replayed WAL and promoted successfully.

| Table | Snapshot rows | Recovered rows |
| --- | ---: | ---: |
| Organizations | 32 | 32 |
| Customers | 34 | 34 |
| Trips | 26 | 26 |
| Invoices | 20 | 20 |
| Payments | 28 | 28 |

Invoice `DEMO-INV-008` remained `37500.00`. The recovered database also contained `written after physical backup` from the probe table, proving WAL replay beyond the base backup. The probe exists only in rehearsal data, never in the live database.

The actual worker was then tested in a separate container using the same shared Unix socket and read-only database-data mount as the overlay. It created a dated logical dump, another full physical backup and a success marker. The rehearsal validates execution and recovery; seven days have not elapsed, so time-based expiry was not observed over a seven-day soak.

For a recovery, stop application writers and use a new empty data volume plus the repository mounted read-only. Run pgBackRest restore with archive mode disabled as above, start the same PostgreSQL major-version image, then verify table counts, known amounts and recovery completion before switching application connections. Keep the original database intact until acceptance. Do not copy a physical backup across incompatible major versions/platforms.

For the requested Render deployment, use managed recovery instead; see [render-deployment.md](render-deployment.md). The earlier `Remaining WP1 work` paragraph describes the first logical-only rehearsal, not the later self-hosted implementation. Render's scheduled offsite logical exports and managed restore proof are still external release gates.
