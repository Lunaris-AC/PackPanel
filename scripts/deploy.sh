#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f .env || { echo 'Configure .env before deploying.' >&2; exit 1; }
docker compose config --quiet
DATA_DIR=$(docker compose config --environment | sed -n 's/^DATA_DIR=//p')
DATA_DIR=${DATA_DIR:-/srv/packpanel}
mkdir -p "$DATA_DIR/storage/objects" "$DATA_DIR/storage/uploads" "$DATA_DIR/storage/endpoints" "$DATA_DIR/backups" "$DATA_DIR/launcher-updates"
chmod 750 "$DATA_DIR/storage/objects" "$DATA_DIR/storage/uploads"
chmod 755 "$DATA_DIR/storage/endpoints"
chmod 700 "$DATA_DIR/backups"
PACKPANEL_BUILD_REVISION=$(
  {
    find packages/launcher/src packages/engine/src packages/protocol/src -type f -print0
    printf '%s\0' package-lock.json packages/launcher/package.json packages/engine/package.json packages/protocol/package.json backend/src/build/desktop-package.ts scripts/copy-launcher-renderer.cjs
  } | LC_ALL=C sort -z | xargs -0 sha1sum | sha1sum | cut -d ' ' -f 1
)
export PACKPANEL_BUILD_REVISION
install -d -m 700 .packpanel-signing
if [ ! -s .packpanel-signing/launcher.pem ]; then
  test ! -e "$DATA_DIR/launcher-updates/windows-x64.json" || { echo 'Restore the launcher signing key before deploying.' >&2; exit 1; }
  (umask 077; openssl genpkey -algorithm ED25519 -out .packpanel-signing/launcher.pem)
fi
chmod 600 .packpanel-signing/launcher.pem
docker compose build
docker compose run --rm --no-deps worker node dist/build/runtime-release.js
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
docker compose run --rm --no-deps worker node dist/build/runtime-release.js --activate
curl --fail --silent --show-error "http://127.0.0.1:$FILES_PORT/launcher-updates/windows-x64.json" >/dev/null
echo "Deployment verified. Admin: http://localhost:$ADMIN_PORT/"
