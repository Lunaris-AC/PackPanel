#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."


if [ $# -lt 1 ]; then
  echo "Usage: $0 <chemin_archive_backup.tar.gz>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erreur: Fichier de sauvegarde introuvable : $BACKUP_FILE"
  exit 1
fi

read -p "Attention : Cette opération va écraser la base PostgreSQL et restaurer les objets CAS. Continuer ? (o/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Oo]$ ]]; then
  echo "Restauration annulée."
  exit 0
fi

TEMP_DIR=$(mktemp -d)

echo "1. Extraction de l'archive..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

echo "2. Restauration des objets CAS..."
mkdir -p /srv/packpanel/storage/objects
cp -rn "${TEMP_DIR}/objects/"* /srv/packpanel/storage/objects/ 2>/dev/null || true

echo "3. Restauration de la base PostgreSQL..."
docker compose exec -T postgres psql -U packpanel -d postgres -c "DROP DATABASE IF EXISTS packpanel;"
docker compose exec -T postgres psql -U packpanel -d postgres -c "CREATE DATABASE packpanel OWNER packpanel;"
docker compose exec -T postgres psql -U packpanel -d packpanel < "${TEMP_DIR}/database.sql"

rm -rf "$TEMP_DIR"
echo "✓ Restauration terminée avec succès !"
