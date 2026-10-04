#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Install Docker before running this script.' >&2; exit 1; }
docker compose version >/dev/null
command -v openssl >/dev/null
if [ ! -f .env ]; then
  umask 077
  ADMIN_FQDN=${ADMIN_FQDN:-panel.example.com}
  FILES_FQDN=${FILES_FQDN:-cdn.example.com}
  DATA_DIR=${DATA_DIR:-/srv/packpanel}
  ADMIN_LOGIN=${ADMIN_LOGIN:-admin}
  ADMIN_ORIGIN_PORT=${ADMIN_ORIGIN_PORT:-8080}
  FILES_ORIGIN_PORT=${FILES_ORIGIN_PORT:-8081}
  INITIAL_PASSWORD=${ADMIN_DEFAULT_PASSWORD:-$(openssl rand -hex 20)}
  cat > .env <<EOF
ADMIN_ORIGIN_PORT=$ADMIN_ORIGIN_PORT
FILES_ORIGIN_PORT=$FILES_ORIGIN_PORT
ADMIN_FQDN=$ADMIN_FQDN
FILES_FQDN=$FILES_FQDN
APP_DIR=$(pwd)
DATA_DIR=$DATA_DIR
ADMIN_LOGIN=$ADMIN_LOGIN
ADMIN_DEFAULT_PASSWORD=$INITIAL_PASSWORD
SESSION_SECRET=$(openssl rand -hex 32)
POSTGRES_DB=packpanel
POSTGRES_USER=packpanel
POSTGRES_PASSWORD=$(openssl rand -hex 24)
EOF
fi
bash scripts/deploy.sh
if [ -n "${INITIAL_PASSWORD:-}" ]; then
  sed -i 's/^ADMIN_DEFAULT_PASSWORD=.*/ADMIN_DEFAULT_PASSWORD=/' .env
  docker compose up -d --no-build api
  ADMIN_READY_PORT=$(docker compose port nginx 8080 | head -n 1)
  ADMIN_READY_PORT=${ADMIN_READY_PORT##*:}
  for attempt in $(seq 1 30); do
    if curl --fail --silent "http://127.0.0.1:$ADMIN_READY_PORT/api/health" >/dev/null; then break; fi
    sleep 1
  done
  curl --fail --silent --show-error "http://127.0.0.1:$ADMIN_READY_PORT/api/health" >/dev/null
  printf 'Initial administrator: %s\nInitial password: %s\n' "$ADMIN_LOGIN" "$INITIAL_PASSWORD"
fi
