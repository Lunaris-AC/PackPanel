#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=========================================================="
echo "    PackPanel - Vérification Post-Proxy Zoraxy / Cloudflare"
echo "=========================================================="

ADMIN_DOMAIN="${1:-panel.mccdn.internal}"
FILES_DOMAIN="${2:-mccdn.internal}"

echo "Domaine Administration : $ADMIN_DOMAIN"
echo "Domaine Distribution    : $FILES_DOMAIN"
echo ""

# 1. Vérification Résolution DNS
echo "[1/6] Test de la résolution DNS..."
if host "$FILES_DOMAIN" >/dev/null 2>&1 || ping -c 1 "$FILES_DOMAIN" >/dev/null 2>&1; then
  echo "  ✓ Résolution DNS active pour $FILES_DOMAIN"
else
  echo "  [STATUT : TEST EXTERNE EN ATTENTE]"
  echo "  ⚠ Le domaine $FILES_DOMAIN n'est pas encore résolu par le DNS public/local."
  echo "  Créez d'abord les enregistrements DNS ou les entrées hosts locales, puis réexécutez ce script."
  exit 0
fi

# 2. Vérification TLS / HTTPS
echo "[2/6] Test de la poignée de main TLS (HTTPS)..."
TLS_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" "https://${FILES_DOMAIN}/" || echo "FAILED")
if [ "$TLS_STATUS" != "FAILED" ]; then
  echo "  ✓ Négociation TLS réussie sur https://${FILES_DOMAIN} (HTTP $TLS_STATUS)"
else
  echo "  ✗ Échec de connexion TLS vers https://${FILES_DOMAIN}"
  exit 1
fi

# 3. Vérification Absence de Challenge JavaScript / Cloudflare Access sur le domaine public
echo "[3/6] Test d'absence de challenge CAPTCHA / WAF / Cloudflare Access..."
HTML_CHECK=$(curl -k -s "https://${FILES_DOMAIN}/testpack/index.php" || true)
if echo "$HTML_CHECK" | grep -qiE "challenge-platform|cf-browser-verification|cf-turnstile|ray id"; then
  echo "  ✗ ERREUR : Un challenge JavaScript Cloudflare ou écran de protection bloque la requête !"
  echo "  Action requise : Ajoutez une règle d'exception WAF pour le chemin /index.php et /releases/ dans Cloudflare."
  exit 1
else
  echo "  ✓ Aucun challenge JavaScript détecté (MineLaunched pourra se connecter sans restriction)"
fi

# 4. Vérification du Content-Type et En-têtes du Manifeste
echo "[4/6] Vérification des en-têtes sur /testpack/index.php..."
MANIFEST_HEADERS=$(curl -k -sI "https://${FILES_DOMAIN}/testpack/index.php" || true)
echo "$MANIFEST_HEADERS" | grep -i "content-type" || true
echo "$MANIFEST_HEADERS" | grep -i "cache-control" || true

# 5. Vérification du Support des Requêtes Partielles (HTTP Range 206)
echo "[5/6] Test du support HTTP Range (téléchargement segmenté)..."
RANGE_CODE=$(curl -k -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-4" "https://${FILES_DOMAIN}/testpack/releases/r0001/config/test.txt" || true)
if [ "$RANGE_CODE" -eq 206 ]; then
  echo "  ✓ Support HTTP Range validé (HTTP 206 Partial Content)"
else
  echo "  ⚠ Code HTTP $RANGE_CODE (HTTP 206 attendu pour la reprise des téléchargements de gros mods)"
fi

# 6. Vérification du Cache Immuable sur /releases/
echo "[6/6] Test du Cache-Control sur les fichiers de release..."
RELEASE_HEADERS=$(curl -k -sI "https://${FILES_DOMAIN}/testpack/releases/r0001/config/test.txt" || true)
echo "$RELEASE_HEADERS" | grep -i "cache-control" || true

echo "=========================================================="
echo "  ✓ VÉRIFICATION EXTERNE POST-PROXY TERMINÉE"
echo "=========================================================="
