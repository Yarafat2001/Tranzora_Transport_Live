#!/bin/sh
set -eu
umask 077
: "${POSTGRES_DB:?Database is required}"
: "${POSTGRES_USER:?Database user is required}"
export PGHOST=/var/run/postgresql PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB"
export PGBACKREST_PG1_USER="$POSTGRES_USER"
mkdir -p /var/lib/pgbackrest/logical
pgbackrest --stanza=tranzora stanza-create
while :; do
  today=$(date -u +%F)
  previous=$(cat /var/lib/pgbackrest/last-success 2>/dev/null || true)
  hour=$(date -u +%H)
  if [ ! -f /var/lib/pgbackrest/last-success ] || { [ "$previous" != "$today" ] && [ "$hour" -ge 2 ]; }; then
    if pg_dump --format=custom --file=/var/lib/pgbackrest/logical/current.partial && pgbackrest --stanza=tranzora --type=full backup; then
      mv /var/lib/pgbackrest/logical/current.partial "/var/lib/pgbackrest/logical/$today.dump"
      date -u +%F > /var/lib/pgbackrest/last-success
      # pgBackRest expires dependent WAL safely. Only logical dumps are removed here.
      find /var/lib/pgbackrest/logical -type f -name '*.dump' -mmin +10080 -delete
      printf '%s backup completed\n' "$today"
    else
      printf '%s backup FAILED; retrying in five minutes\n' "$today" >&2
      sleep 300
      continue
    fi
  fi
  sleep 60
done
