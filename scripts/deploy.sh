#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==============================================="
echo "        PackPanel - Déploiement Automatisé     "
echo "==============================================="

DATA_DIR="/srv/packpanel"

echo "[1/6] Préparation des répertoires de stockage..."
mkdir -p "${DATA_DIR}/storage/objects"
mkdir -p "${DATA_DIR}/storage/uploads"
mkdir -p "${DATA_DIR}/storage/endpoints"
mkdir -p "${DATA_DIR}/backups"
chmod -R 755 "${DATA_DIR}/storage"
chmod 700 "${DATA_DIR}/backups"

echo "[2/6] Configuration de l'environnement (.env)..."
if [ ! -f .env ]; then
  echo "Génération d'un fichier .env à partir de .env.example..."
  cp .env.example .env
  
  # Generate random secure session secret & db password
  RANDOM_SECRET=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  RANDOM_DB_PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 24)
  
  sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=${RANDOM_SECRET}/" .env
  sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${RANDOM_DB_PASS}/" .env
fi

echo "[3/6] Compilation des conteneurs Docker..."
docker compose build

echo "[4/6] Démarrage des services..."
docker compose up -d

echo "[5/6] Exécution des migrations de base de données..."
# Wait for API container and Postgres to be ready
echo "Attente de la base de données..."
sleep 4
docker compose exec api node dist/db/migrate.js

echo "[6/6] Exécution des tests de bon fonctionnement..."
chmod +x ./scripts/smoke-test.sh
./scripts/smoke-test.sh 127.0.0.1 8080 8081

echo "==============================================="
echo "  ✓ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS !"
echo "==============================================="
echo "Panel d'administration : http://192.168.1.171:8080"
echo "Distribution publique  : http://192.168.1.171:8081"
echo "Identifiants d'admin   : voir /srv/packpanel/admin_credentials.txt ou logs de migration"
echo "==============================================="
