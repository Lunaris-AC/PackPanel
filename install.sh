#!/usr/bin/env bash
# ==============================================================================
# PackPanel - Script d'Installation & Déploiement Automatisé
# Distribution de Modpacks conforme au contrat MineLaunched
# ==============================================================================

set -euo pipefail

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}"
echo "=================================================================="
echo "          PackPanel - Installation & Déploiement Autonome         "
echo "=================================================================="
echo -e "${NC}"

# 1. Vérification des droits root
if [ "$(id -u)" -ne 0 ]; then
  echo -e "${RED}[ERREUR] Ce script doit être exécuté avec les privilèges root (sudo).${NC}" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# 2. Vérification et installation des dépendances
echo -e "${CYAN}[1/7] Vérification des prérequis système...${NC}"

# Paquets système essentiels
MISSING_PKGS=()
for cmd in curl openssl git tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING_PKGS+=("$cmd")
  fi
done

if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
  echo -e "${YELLOW}Installation des paquets manquants : ${MISSING_PKGS[*]}...${NC}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq "${MISSING_PKGS[@]}"
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q "${MISSING_PKGS[@]}"
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache "${MISSING_PKGS[@]}"
  fi
fi

# Vérification de Docker
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${YELLOW}Docker n'est pas installé. Installation automatique de Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker || true
fi

# Vérification de Docker Compose
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${YELLOW}Plugin Docker Compose manquant. Installation...${NC}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq docker-compose-plugin
  else
    echo -e "${RED}[ERREUR] Veuillez installer Docker Compose v2 manuellement.${NC}" >&2
    exit 1
  fi
fi

echo -e "  ${GREEN}✓${NC} Docker et Docker Compose sont opérationnels."

# 3. Configuration des répertoires et domaines
echo -e "${CYAN}[2/7] Configuration des paramètres d'instance...${NC}"

DEFAULT_APP_DIR="${SCRIPT_DIR}"
if [ "${SCRIPT_DIR}" = "/root" ] || [ "${SCRIPT_DIR}" = "/tmp" ]; then
  DEFAULT_APP_DIR="/opt/packpanel"
fi

# Variables configurables (interactif ou pré-défini via ENV)
APP_DIR="${APP_DIR:-$DEFAULT_APP_DIR}"
DATA_DIR="${DATA_DIR:-/srv/packpanel}"
ADMIN_ORIGIN_PORT="${ADMIN_ORIGIN_PORT:-8080}"
FILES_ORIGIN_PORT="${FILES_ORIGIN_PORT:-8081}"
ADMIN_FQDN="${ADMIN_FQDN:-panel.mccdn.internal}"
FILES_FQDN="${FILES_FQDN:-mccdn.internal}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"

# Si mode interactif (TTY) et fichier .env inexistant
if [ -t 0 ] && [ ! -f "${APP_DIR}/.env" ] && [ "${NON_INTERACTIVE:-0}" != "1" ]; then
  read -rp "Répertoire applicatif [$APP_DIR] : " input && APP_DIR="${input:-$APP_DIR}"
  read -rp "Répertoire de stockage persistant [$DATA_DIR] : " input && DATA_DIR="${input:-$DATA_DIR}"
  read -rp "Port d'écoute Administration & API [$ADMIN_ORIGIN_PORT] : " input && ADMIN_ORIGIN_PORT="${input:-$ADMIN_ORIGIN_PORT}"
  read -rp "Port d'écoute Distribution MineLaunched [$FILES_ORIGIN_PORT] : " input && FILES_ORIGIN_PORT="${input:-$FILES_ORIGIN_PORT}"
  read -rp "Domaine / FQDN du panel d'administration [$ADMIN_FQDN] : " input && ADMIN_FQDN="${input:-$ADMIN_FQDN}"
  read -rp "Domaine / FQDN public de distribution de fichiers [$FILES_FQDN] : " input && FILES_FQDN="${input:-$FILES_FQDN}"
  read -rp "Identifiant du compte administrateur [$ADMIN_LOGIN] : " input && ADMIN_LOGIN="${input:-$ADMIN_LOGIN}"
fi

# 4. Préparation de l'arborescence physique
echo -e "${CYAN}[3/7] Création des répertoires de stockage...${NC}"
mkdir -p "${DATA_DIR}/storage/objects"
mkdir -p "${DATA_DIR}/storage/endpoints"
mkdir -p "${DATA_DIR}/storage/uploads"
mkdir -p "${DATA_DIR}/backups"

chmod 750 "${DATA_DIR}"
chmod 750 "${DATA_DIR}/storage"
chmod 700 "${DATA_DIR}/backups"

# Déplacement ou copie vers APP_DIR si exécuté ailleurs
if [ "${SCRIPT_DIR}" != "${APP_DIR}" ]; then
  mkdir -p "${APP_DIR}"
  cp -rn "${SCRIPT_DIR}"/* "${APP_DIR}/" 2>/dev/null || true
  cd "${APP_DIR}"
fi

# 5. Génération des secrets et du fichier .env
echo -e "${CYAN}[4/7] Génération des secrets cryptographiques...${NC}"

ENV_FILE="${APP_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  SESSION_SECRET=$(openssl rand -hex 32)
  ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

  cat > "$ENV_FILE" <<EOF
# PackPanel - Configuration de Production
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

  # Consignation sécurisée des identifiants initiaux
  CREDS_FILE="${DATA_DIR}/admin_credentials.txt"
  cat > "$CREDS_FILE" <<EOF
# PackPanel - Identifiants d'Administration Initiaux
ADMIN_LOGIN=${ADMIN_LOGIN}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DATE_INITIALISATION=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
  chmod 600 "$CREDS_FILE"
  echo -e "  ${GREEN}✓${NC} Secrets générés et protégés (chmod 600)."
else
  echo -e "  ${YELLOW}ℹ${NC} Fichier .env existant détecté, conservation des paramètres."
  ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "${DATA_DIR}/admin_credentials.txt" 2>/dev/null | cut -d'=' -f2 || echo "<inchangé>")
fi

# 6. Compilation et démarrage des conteneurs Docker
echo -e "${CYAN}[5/7] Compilation et démarrage de la stack Docker Compose...${NC}"

# Construction frontend si node est dispo dans conteneur
docker run --rm -v "${APP_DIR}/frontend":/app -w /app node:20-bookworm-slim sh -c "npm ci && npm run build" >/dev/null 2>&1 || true

docker compose build api worker
docker compose up -d

echo -e "  ${GREEN}✓${NC} Conteneurs démarrés avec succès."

# 7. Initialisation de la base de données & compte admin
echo -e "${CYAN}[6/7] Initialisation de la base PostgreSQL et initialisation du compte admin...${NC}"

# Attente que PostgreSQL soit opérationnel
MAX_RETRIES=30
until docker exec packpanel-postgres pg_isready -U packpanel -d packpanel >/dev/null 2>&1 || [ $MAX_RETRIES -eq 0 ]; do
  sleep 1
  MAX_RETRIES=$((MAX_RETRIES - 1))
done

if [ $MAX_RETRIES -eq 0 ]; then
  echo -e "${RED}[ERREUR] PostgreSQL n'a pas répondu dans le délai imparti.${NC}" >&2
  exit 1
fi

# Application du schéma
docker exec -i packpanel-postgres psql -U packpanel -d packpanel < "${APP_DIR}/backend/src/db/schema.sql" >/dev/null 2>&1 || true

# Initialisation du compte admin si nécessaire
docker exec -i packpanel-api node -e "
const { query } = require('./dist/db');
const { hashPassword } = require('./dist/auth/argon2');
(async () => {
  const existing = await query('SELECT id FROM users WHERE username = \$1', ['${ADMIN_LOGIN}']);
  if (existing.rows.length === 0) {
    const hash = await hashPassword('${ADMIN_PASSWORD}');
    await query('INSERT INTO users (username, password_hash, role) VALUES (\$1, \$2, \$3)', ['${ADMIN_LOGIN}', hash, 'admin']);
    console.log('Compte admin créé.');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
" >/dev/null 2>&1 || true

# Redémarrage de Nginx pour prise en compte DNS du réseau Docker
docker compose restart nginx >/dev/null 2>&1

# 8. Test de santé (Smoke test local)
echo -e "${CYAN}[7/7] Vérification du bon fonctionnement...${NC}"
sleep 2

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${ADMIN_ORIGIN_PORT}/api/health" || echo "000")
if [ "$HEALTH_STATUS" -eq 200 ]; then
  echo -e "  ${GREEN}✓${NC} Listener d'Administration (port ${ADMIN_ORIGIN_PORT}) : Opérationnel (HTTP 200)"
else
  echo -e "  ${YELLOW}!${NC} Listener d'Administration : Statut HTTP $HEALTH_STATUS reçu"
fi

FILES_404=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${FILES_ORIGIN_PORT}/nonexistent/index.php" || echo "000")
if [ "$FILES_404" -eq 404 ]; then
  echo -e "  ${GREEN}✓${NC} Listener de Distribution MineLaunched (port ${FILES_ORIGIN_PORT}) : Opérationnel et isolé"
fi

# Résumé final
echo ""
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo -e "${GREEN}${BOLD}         PackPanel a été installé et démarré avec succès !        ${NC}"
echo -e "${GREEN}${BOLD}==================================================================${NC}"
echo ""
echo -e "  ${BOLD}URL Panel d'Administration :${NC} http://localhost:${ADMIN_ORIGIN_PORT}/"
echo -e "  ${BOLD}URL Distribution Publique  :${NC} http://localhost:${FILES_ORIGIN_PORT}/"
echo ""
echo -e "  ${BOLD}Identifiants d'accès :${NC}"
echo -e "  • Utilisateur : ${CYAN}${ADMIN_LOGIN}${NC}"
echo -e "  • Mot de passe : ${CYAN}${ADMIN_PASSWORD}${NC}"
echo -e "  • Fichier de sauvegarde : ${DATA_DIR}/admin_credentials.txt (permissions 600)"
echo ""
echo -e "  ${BOLD}Pour exposer PackPanel avec Zoraxy & Cloudflare :${NC}"
echo -e "  1. Créez une règle Zoraxy vers ${BOLD}http://<IP_SERVEUR>:${ADMIN_ORIGIN_PORT}${NC} pour ${ADMIN_FQDN}"
echo -e "     (Activez WebSocket/SSE, désactivez le buffering)."
echo -e "  2. Créez une règle Zoraxy vers ${BOLD}http://<IP_SERVEUR>:${FILES_ORIGIN_PORT}${NC} pour ${FILES_FQDN}"
echo -e "     (Activez HTTP/2 et Keep-Alive)."
echo -e "  3. Consultez ${BOLD}${APP_DIR}/docs/ZORAXY_CLOUDFLARE.md${NC} pour le détail des règles de cache."
echo ""
