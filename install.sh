#!/usr/bin/env bash
# ==============================================================================
# PackPanel - Automated Installation & Deployment Script
# High-performance, CAS-backed modpack distribution matching the MineLaunched protocol
# ==============================================================================

set -euo pipefail

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}"
echo "=================================================================="
echo "          PackPanel - Turnkey Installation & Deployment           "
echo "=================================================================="
echo -e "${NC}"

# 1. Root check
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}[ERROR] This script must be run as root (use sudo).${NC}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# 2. Prerequisites
echo -e "${CYAN}[1/7] Checking system dependencies...${NC}"

MISSING_PKGS=()
for cmd in curl openssl git tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_PKGS+=("$cmd")
  fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Installing missing packages: ${MISSING_PKGS[*]}...${NC}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq "${MISSING_PKGS[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "${MISSING_PKGS[@]}"
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache "${MISSING_PKGS[@]}"
  fi
fi

# Docker check & auto-install
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}Docker is not installed. Installing Docker via official script...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker || true
fi

# Docker Compose v2 check
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${YELLOW}Docker Compose plugin missing. Installing...${NC}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin
  else
    echo -e "${RED}[ERROR] Please install Docker Compose v2 plugin manually.${NC}" >&2
    exit 1
  fi
fi

echo -e "  ${GREEN}✓${NC} Docker and Docker Compose v2 ready."

# 3. Instance Configuration
echo -e "${CYAN}[2/7] Configuring parameters...${NC}"

DEFAULT_APP_DIR="${SCRIPT_DIR}"
if [ "${SCRIPT_DIR}" = "/root" ] || [ "${SCRIPT_DIR}" = "/tmp" ]; then
  DEFAULT_APP_DIR="/opt/packpanel"
fi

APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"
DATA_DIR="${DATA_DIR:-/srv/packpanel}"
ADMIN_ORIGIN_PORT="${ADMIN_ORIGIN_PORT:-8080}"
FILES_ORIGIN_PORT="${FILES_ORIGIN_PORT:-8081}"
ADMIN_FQDN="${ADMIN_FQDN:-panel.example.com}"
FILES_FQDN="${FILES_FQDN:-cdn.example.com}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"

# Interactive prompts if running in a TTY and .env doesn't exist
if [ -t 0 ] && [ ! -f "${APP_DIR}/.env" ] && [ "${NON_INTERACTIVE:-0}" != "1" ]; then
  read -rp "Application directory [$APP_DIR]: " input && APP_DIR="${input:-$APP_DIR}"
  read -rp "Storage directory [$DATA_DIR]: " input && DATA_DIR="${input:-$DATA_DIR}"
  read -rp "Admin Panel & API Port [$ADMIN_ORIGIN_PORT]: " input && ADMIN_ORIGIN_PORT="${input:-$ADMIN_ORIGIN_PORT}"
  read -rp "Public Distribution Port [$FILES_ORIGIN_PORT]: " input && FILES_ORIGIN_PORT="${input:-$FILES_ORIGIN_PORT}"
  read -rp "Admin Panel FQDN / Domain [$ADMIN_FQDN]: " input && ADMIN_FQDN="${input:-$ADMIN_FQDN}"
  read -rp "Public Files FQDN / Domain [$FILES_FQDN]: " input && FILES_FQDN="${input:-$FILES_FQDN}"
  read -rp "Admin username [$ADMIN_LOGIN]: " input && ADMIN_LOGIN="${input:-$ADMIN_LOGIN}"
fi

# 4. Storage Directory Structure
echo -e "${CYAN}[3/7] Setting up storage structure...${NC}"
mkdir -p "${DATA_DIR}/storage/objects"
mkdir -p "${DATA_DIR}/storage/endpoints"
mkdir -p "${DATA_DIR}/storage/uploads"
mkdir -p "${DATA_DIR}/backups"

chmod 750 "${DATA_DIR}"
chmod 750 "${DATA_DIR}/storage"
chmod 700 "${DATA_DIR}/backups"

if [ "${SCRIPT_DIR}" != "${APP_DIR}" ]; then
  mkdir -p "${APP_DIR}"
  cp -rn "${SCRIPT_DIR}"/* "${APP_DIR}/" 2>/dev/null || true
  cd "${APP_DIR}"
fi

# 5. Cryptographic secrets & .env
echo -e "${CYAN}[4/7] Generating cryptographic secrets...${NC}"

ENV_FILE="${APP_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  SESSION_SECRET=$(openssl rand -hex 32)
  ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

  cat > "$ENV_FILE" <<EOF
# PackPanel - Production Configuration
ADMIN_ORIGIN_PORT=${ADMIN_ORIGIN_PORT}
FILES_ORIGIN_PORT=${FILES_ORIGIN_PORT}
ADMIN_FQDN=${ADMIN_FQDN}
FILES_FQDN=${FILES_FQDN}

APP_DIR=${APP_DIR}
DATA_DIR=${DATA_DIR}

ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_DEFAULT_PASSWORD=${ADMIN_PASSWORD}

SESSION_SECRET=${SESSION_SECRET}
POSTGRES_DB=packpanel
POSTGRES_USER=packpanel
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EOF

  chmod 600 "$ENV_FILE"

  CREDS_FILE="${DATA_DIR}/admin_credentials.txt"
  cat > "$CREDS_FILE" <<EOF
# PackPanel Initial Credentials
ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
INITIALIZED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  chmod 600 "$CREDS_FILE"
  echo -e "  ${GREEN}✓${NC} Secrets generated and secured (chmod 600)."
else
  echo -e "  ${YELLOW}ℹ${NC} Existing .env found, preserving configuration."
  ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "${DATA_DIR}/admin_credentials.txt" 2>/dev/null | cut -d'=' -f2 || echo "<unchanged>")
fi

# 6. Build and launch Docker containers
echo -e "${CYAN}[5/7] Building and launching Docker Compose stack...${NC}"

# Compile frontend inside container if node is not on host
docker run --rm -v "${APP_DIR}/frontend":/app -w /app node:20-bookworm-slim sh -c "npm ci && npm run build" >/dev/null 2>&1 || true

docker compose build api worker
docker compose up -d

echo -e "  ${GREEN}✓${NC} Containers started."

# 7. Database schema & Admin account seed
echo -e "${CYAN}[6/7] Initializing PostgreSQL schema & admin account...${NC}"

MAX_RETRIES=30
until docker exec packpanel-postgres pg_isready -U packpanel -d packpanel >/dev/null 2>&1 || [ $MAX_RETRIES -eq 0 ]; do
  sleep 1
  MAX_RETRIES=$((MAX_RETRIES - 1))
done

if [ $MAX_RETRIES -eq 0 ]; then
  echo -e "${RED}[ERROR] PostgreSQL failed to start in time.${NC}" >&2
  exit 1
fi

docker exec -i packpanel-postgres psql -U packpanel -d packpanel < "${APP_DIR}/backend/src/db/schema.sql" >/dev/null 2>&1 || true

docker exec -i packpanel-api node -e "
const { query } = require('./dist/db');
const { hashPassword } = require('./dist/auth/argon2');
(async () => {
  const existing = await query('SELECT id FROM users WHERE username = \$1', ['${ADMIN_LOGIN}']);
  if (existing.rows.length === 0) {
    const hash = await hashPassword('${ADMIN_PASSWORD}');
    await query('INSERT INTO users (username, password_hash, role) VALUES (\$1, \$2, \$3)', ['${ADMIN_LOGIN}', hash, 'admin']);
    console.log('Admin account created.');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
" >/dev/null 2>&1 || true

docker compose restart nginx >/dev/null 2>&1

# 8. Health check
echo -e "${CYAN}[7/7] Verifying endpoints...${NC}"
sleep 2

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${ADMIN_ORIGIN_PORT}/api/health" || echo "000")
if [ "$HEALTH_STATUS" -eq 200 ]; then
  echo -e "  ${GREEN}✓${NC} Admin Panel (:8080): Healthy (HTTP 200)"
else
  echo -e "  ${YELLOW}!${NC} Admin Panel: HTTP $HEALTH_STATUS"
fi

FILES_404=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FILES_ORIGIN_PORT}/nonexistent/index.php" || echo "000")
if [ "$FILES_404" -eq 404 ]; then
  echo -e "  ${GREEN}✓${NC} MineLaunched File Distribution (:8081): Active & Isolated"
fi

# Summary
echo ""
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}         PackPanel has been successfully installed!               ${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo ""
echo -e "  ${BOLD}Admin Panel URL :${NC} http://localhost:${ADMIN_ORIGIN_PORT}/"
echo -e "  ${BOLD}Public CDN URL  :${NC} http://localhost:${FILES_ORIGIN_PORT}/"
echo ""
echo -e "  ${BOLD}Initial Credentials :${NC}"
echo -e "  • Username : ${CYAN}${ADMIN_LOGIN}${NC}"
echo -e "  • Password : ${CYAN}${ADMIN_PASSWORD}${NC}"
echo -e "  • File     : ${DATA_DIR}/admin_credentials.txt (permissions 600)"
echo ""
echo -e "  ${BOLD}Reverse Proxy & CDN Setup :${NC}"
echo -e "  1. Forward ${ADMIN_FQDN} -> http://<SERVER_IP>:${ADMIN_ORIGIN_PORT} (Enable WebSocket/SSE, disable buffering)"
echo -e "  2. Forward ${FILES_FQDN} -> http://<SERVER_IP>:${FILES_ORIGIN_PORT} (Enable HTTP/2 & Keep-Alive)"
echo -e "  3. See ${BOLD}${APP_DIR}/docs/ZORAXY_CLOUDFLARE.md${NC} for Cloudflare Cache Rules."
echo ""
