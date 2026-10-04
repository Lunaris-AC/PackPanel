#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f .env || { echo 'Configure .env before deploying.' >&2; exit 1; }
docker compose config --quiet
DATA_DIR=$(docker compose config --environment | sed -n 's/^DATA_DIR=//p')
DATA_DIR=${DATA_DIR:-/srv/packpanel}
mkdir -p "$DATA_DIR/storage/objects" "$DATA_DIR/storage/uploads" "$DATA_DIR/storage/endpoints" "$DATA_DIR/backups"
chmod 750 "$DATA_DIR/storage/objects" "$DATA_DIR/storage/uploads"
chmod 755 "$DATA_DIR/storage/endpoints"
chmod 700 "$DATA_DIR/backups"
docker compose build
if docker compose ps --status running --services | grep -qx api; then
  bash scripts/backup.sh
fi
docker compose stop api worker
docker compose up -d --wait postgres
docker compose run --rm --no-deps api node dist/db/migrate.js
find "$DATA_DIR/storage/endpoints" -mindepth 1 -maxdepth 1 -type d -exec chmod 755 {} +
find "$DATA_DIR/storage/endpoints" -path '*/releases' -type d -exec chmod 755 {} +
find "$DATA_DIR/storage/endpoints" -path '*/releases/*' -type d -exec chmod 755 {} +
find "$DATA_DIR/storage/endpoints" -path '*/releases/*' -type f -exec chmod 644 {} +
docker compose up -d --no-build
ADMIN_PORT=$(docker compose port nginx 8080 | head -n 1); ADMIN_PORT=${ADMIN_PORT##*:}
FILES_PORT=$(docker compose port nginx 8081 | head -n 1); FILES_PORT=${FILES_PORT##*:}
for attempt in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:$ADMIN_PORT/api/health" >/dev/null; then break; fi
  sleep 1
done
bash scripts/smoke-test.sh 127.0.0.1 "$ADMIN_PORT" "$FILES_PORT"
echo "Deployment verified. Admin: http://localhost:$ADMIN_PORT/"
