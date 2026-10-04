#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
YES=false
if [ "${1:-}" = '--yes' ]; then YES=true; shift; fi
BACKUP_FILE=${1:?Usage: restore.sh [--yes] backup.tar.gz}
test -f "$BACKUP_FILE"
if [ "$YES" = false ]; then
  read -rp 'Replace the database and restore the distribution from this backup? [yes/NO] ' ANSWER
  [ "$ANSWER" = yes ] || exit 0
fi
DATA_DIR=$(docker compose config --environment | sed -n 's/^DATA_DIR=//p')
DATA_DIR=${DATA_DIR:-/srv/packpanel}
[ "$DATA_DIR" != '/' ] && [ -d "$DATA_DIR/storage" ]
TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
test -s "$TEMP_DIR/database.dump"
test -d "$TEMP_DIR/storage"
docker compose stop api worker
docker compose exec -T postgres sh -c 'dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB"; createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$TEMP_DIR/database.dump"
cp -a "$TEMP_DIR/storage/." "$DATA_DIR/storage/"
if [ -d "$TEMP_DIR/builds" ]; then mkdir -p "$DATA_DIR/builds"; cp -a "$TEMP_DIR/builds/." "$DATA_DIR/builds/"; fi
if [ -f "$TEMP_DIR/public-config.json" ]; then cp "$TEMP_DIR/public-config.json" "$DATA_DIR/public-config.json"; fi
docker compose start api worker
ADMIN_ADDRESS=$(docker compose port nginx 8080 | head -n 1)
if [ -n "$ADMIN_ADDRESS" ]; then
  ADMIN_PORT=${ADMIN_ADDRESS##*:}
  curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 --max-time 5 "http://127.0.0.1:$ADMIN_PORT/api/health" >/dev/null
fi
echo 'Database, storage and launcher artifacts restored. The archived environment.env is retained for manual credential recovery.'
