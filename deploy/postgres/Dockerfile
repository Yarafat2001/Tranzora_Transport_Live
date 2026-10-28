FROM postgres:18-alpine
RUN apk add --no-cache pgbackrest && mkdir -p /var/lib/pgbackrest /var/log/pgbackrest && chown -R postgres:postgres /var/lib/pgbackrest /var/log/pgbackrest
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
COPY backup-loop.sh /usr/local/bin/tranzora-backup
RUN chmod 755 /usr/local/bin/tranzora-backup
