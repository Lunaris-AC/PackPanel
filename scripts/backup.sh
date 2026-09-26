#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="/srv/packpanel/backups"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TARGET_FILE="${BACKUP_DIR}/packpanel_backup_${TIMESTAMP}.tar.gz"
TEMP_DIR=$(mktemp -d)

mkdir -p "$BACKUP_DIR"

echo "=== Sauvegarde PackPanel ($TIMESTAMP) ==="
echo "1. Exportation de la base PostgreSQL..."
docker compose exec -T postgres pg_dump -U packpanel -d packpanel > "${TEMP_DIR}/database.sql"

echo "2. Archivage des objets CAS et de la base..."
tar -czf "$TARGET_FILE" \
  -C "${TEMP_DIR}" database.sql \
  -C "/srv/packpanel/storage" objects

rm -rf "$TEMP_DIR"

# Rétention : conserver les 10 dernières sauvegardes
ls -dt ${BACKUP_DIR}/packpanel_backup_*.tar.gz | tail -n +11 | xargs -r rm -f

echo "✓ Sauvegarde terminée avec succès : $TARGET_FILE ($(du -h "$TARGET_FILE" | cut -f1))"
