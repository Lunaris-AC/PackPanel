#!/usr/bin/env bash
set -euo pipefail

echo "==============================================="
echo "        PackPanel - Test de Validation         "
echo "==============================================="

HOST="${1:-127.0.0.1}"
ADMIN_PORT="${2:-8080}"
FILES_PORT="${3:-8081}"

echo "[1/4] Test du listener d'administration (port $ADMIN_PORT)..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${ADMIN_PORT}/api/health" || true)
if [ "$HEALTH_STATUS" -eq 200 ]; then
  echo "  ✓ API et Panel opérationnels (HTTP 200 sur /api/health)"
else
  echo "  ✗ ÉCHEC : Code HTTP $HEALTH_STATUS reçu sur /api/health"
  exit 1
fi

echo "[2/4] Test du listener de distribution MineLaunched (port $FILES_PORT)..."
# Missing file must return 404, never 200 empty array
FILES_404_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${FILES_PORT}/nonexistent_endpoint/index.php" || true)
if [ "$FILES_404_STATUS" -eq 404 ]; then
  echo "  ✓ Endpoint inexistant retourne bien HTTP 404 (évite tout faux nettoyage MineLaunched)"
else
  echo "  ✗ ÉCHEC : Code HTTP $FILES_404_STATUS au lieu de 404 sur un endpoint inconnu"
  exit 1
fi

echo "[3/4] Vérification de l'étanchéité du listener public (port $FILES_PORT)..."
# Port 8081 must NEVER give access to /api/
LEAK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${FILES_PORT}/api/health" || true)
if [ "$LEAK_STATUS" -eq 404 ]; then
  echo "  ✓ Étanchéité validée : le port 8081 ne donne pas accès à l'API privée (HTTP 404)"
else
  echo "  ✗ ÉCHEC DE SÉCURITÉ : Le port 8081 a répondu HTTP $LEAK_STATUS sur /api/health"
  exit 1
fi

echo "[4/4] Test du service Web SPA (port $ADMIN_PORT)..."
SPA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${HOST}:${ADMIN_PORT}/" || true)
if [ "$SPA_STATUS" -eq 200 ]; then
  echo "  ✓ Interface web React servie correctement (HTTP 200)"
else
  echo "  ✗ ÉCHEC : Code HTTP $SPA_STATUS sur l'interface SPA"
  exit 1
fi

echo "==============================================="
echo "  ✓ TOUS LES TESTS DE SMOKE SONT VALIDÉS AVEC SUCCÈS !"
echo "==============================================="
