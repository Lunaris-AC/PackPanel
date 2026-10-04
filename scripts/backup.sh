#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DATA_DIR=$(docker compose config --environment | sed -n 's/^DATA_DIR=//p')
DATA_DIR=${DATA_DIR:-/srv/packpanel}
BACKUP_DIR=${BACKUP_DIR:-$DATA_DIR/backups}
umask 077
mkdir -p "$BACKUP_DIR"
TEMP_DIR=$(mktemp -d)
TARGET_FILE="$BACKUP_DIR/packpanel_backup_$(date -u +%Y%m%d_%H%M%S).tar.gz"
RUNNING_SERVICES=$(docker compose ps --status running --services | grep -E '^(api|worker)$' || true)
finish() {
  rm -rf -- "$TEMP_DIR"
  if [ -n "$RUNNING_SERVICES" ]; then docker compose start $RUNNING_SERVICES >/dev/null; fi
}
trap finish EXIT
docker compose stop api worker >/dev/null
docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$TEMP_DIR/database.dump"
cp .env "$TEMP_DIR/environment.env"
git rev-parse HEAD > "$TEMP_DIR/source-commit.txt" 2>/dev/null || printf 'source archive\n' > "$TEMP_DIR/source-commit.txt"
ITEMS=(storage)
for item in builds public-config.json; do
  if [ -e "$DATA_DIR/$item" ]; then ITEMS+=("$item"); fi
done
tar -czf "$TARGET_FILE" -C "$TEMP_DIR" database.dump environment.env source-commit.txt -C "$DATA_DIR" "${ITEMS[@]}"
tar -tzf "$TARGET_FILE" >/dev/null
echo "Backup verified: $TARGET_FILE"
