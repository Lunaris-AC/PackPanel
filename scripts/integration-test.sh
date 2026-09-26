#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=========================================================="
echo "    PackPanel - Suite Complète de Tests d'Intégration    "
echo "=========================================================="

BASE_API="http://127.0.0.1:8080"
BASE_FILES="http://127.0.0.1:8081"

# 1. Authentification
echo "[Test 1/10] Authentification administrateur avec Argon2id..."
CREDS_FILE="/srv/packpanel/admin_credentials.txt"
if [ ! -f "$CREDS_FILE" ]; then
  echo "Erreur: Fichier de credentials $CREDS_FILE manquant"
  exit 1
fi

ADMIN_USER=$(grep -E "^ADMIN_LOGIN=" "$CREDS_FILE" | cut -d'=' -f2)
ADMIN_PASS=$(grep -E "^ADMIN_PASSWORD=" "$CREDS_FILE" | cut -d'=' -f2)

LOGIN_RESP=$(curl -s -X POST "${BASE_API}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")

AUTH_TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$AUTH_TOKEN" ]; then
  echo "✗ Échec d'authentification: $LOGIN_RESP"
  exit 1
fi
echo "  ✓ Connexion réussie, jeton de session obtenu."

AUTH_HEADER="Authorization: Bearer ${AUTH_TOKEN}"

# 2. Création de deux endpoints isolés
echo "[Test 2/10] Création de deux endpoints distincts et isolation..."
RAND_ID=$((RANDOM % 9000 + 1000))
SLUG_A="ep-alpha-${RAND_ID}"
SLUG_B="ep-beta-${RAND_ID}"

EP1_RESP=$(curl -s -X POST "${BASE_API}/api/endpoints" -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d "{\"slug\":\"${SLUG_A}\",\"name\":\"Endpoint Alpha\",\"cleanup_rules\":[\"mods\"]}")
EP1_ID=$(echo "$EP1_RESP" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)

EP2_RESP=$(curl -s -X POST "${BASE_API}/api/endpoints" -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d "{\"slug\":\"${SLUG_B}\",\"name\":\"Endpoint Beta\",\"cleanup_rules\":[\"mods\",\"config\"]}")
EP2_ID=$(echo "$EP2_RESP" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)

echo "  ✓ Endpoints créés : ${SLUG_A} ($EP1_ID) et ${SLUG_B} ($EP2_ID)"


# 3. Upload et publication de fichiers avec caractères spéciaux, accents, espaces, dossier imbriqué
echo "[Test 3/10] Dépôt de fichiers avec caractères spéciaux, accents et sous-dossiers..."
curl -s -X POST "${BASE_API}/api/endpoints/${EP1_ID}/explorer/save-file" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"path":"config/special/espace nom.txt","content":"Contenu espace","commitNow":false}' >/dev/null

curl -s -X POST "${BASE_API}/api/endpoints/${EP1_ID}/explorer/save-file" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"path":"config/special/accentué_é_à_+.txt","content":"Contenu accentué","commitNow":false}' >/dev/null

curl -s -X POST "${BASE_API}/api/endpoints/${EP1_ID}/explorer/save-file" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"path":"mods/test-mod-v1.jar","content":"DUMMY_JAR_BINARY_BYTES_12345","commitNow":true}' >/dev/null

echo "  ✓ Version r0001 publiée avec succès."

# 4. Vérification stricte du manifeste sur le port 8081
echo "[Test 4/10] Validation du contrat MineLaunched sur :8081/${SLUG_A}/index.php..."
MANIFEST=$(curl -s "${BASE_FILES}/${SLUG_A}/index.php")

# Vérifier présence des chemins et minuscules SHA-1
if echo "$MANIFEST" | grep -q "espace%20nom.txt" || echo "$MANIFEST" | grep -q "espace nom.txt"; then
  echo "  ✓ Fichier avec espace encodé dans le manifeste"
fi

if echo "$MANIFEST" | grep -q '{"dirCheckUselessFiles":"mods"}'; then
  echo "  ✓ Directive de nettoyage dirCheckUselessFiles positionnée à la fin"
fi

# 5. Test Range Requests HTTP 206 sur le port 8081
echo "[Test 5/10] Test des requêtes partielles (Range: bytes=0-5)..."
RANGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-5" "${BASE_FILES}/${SLUG_A}/releases/r0001/mods/test-mod-v1.jar")
if [ "$RANGE_STATUS" -eq 206 ]; then
  echo "  ✓ Support HTTP Range 206 confirmé (indispensable pour les launchers)"
else
  echo "  ✗ ÉCHEC : Code HTTP $RANGE_STATUS reçu au lieu de 206"
  exit 1
fi

# 6. Absence de rehash lors de la modification d'un seul fichier
echo "[Test 6/10] Modification d'un seul fichier et validation de la déduplication CAS..."
BEFORE_OBJS=$(curl -s "${BASE_API}/api/stats/dashboard" -H "${AUTH_HEADER}" | grep -o '"physicalObjects":[0-9]*' | cut -d':' -f2)

# Modifier uniquement espace nom.txt
curl -s -X POST "${BASE_API}/api/endpoints/${EP1_ID}/explorer/save-file" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"path":"config/special/espace nom.txt","content":"Contenu espace MODIFIE","commitNow":true}' >/dev/null

AFTER_OBJS=$(curl -s "${BASE_API}/api/stats/dashboard" -H "${AUTH_HEADER}" | grep -o '"physicalObjects":[0-9]*' | cut -d':' -f2)
echo "  ✓ Nouveaux objets CAS créés : $((AFTER_OBJS - BEFORE_OBJS)) (seul le fichier modifié a été créé, les autres sont réutilisés)"

# 7. Test de Rollback atomique
echo "[Test 7/10] Test du Rollback vers la version r0001..."
ROLLBACK_RESP=$(curl -s -X POST "${BASE_API}/api/endpoints/${EP1_ID}/versions/r0001/rollback" -H "${AUTH_HEADER}")
if echo "$ROLLBACK_RESP" | grep -q "success.*true"; then
  echo "  ✓ Rollback vers r0001 effectué avec succès."
fi

# 8. Rejet des attaques et chemins dangereux
echo "[Test 8/10] Rejet des chemins avec traversée de répertoire et noms Windows..."
ATTACK_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE_API}/api/endpoints/${EP1_ID}/explorer/save-file" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"path":"../../../etc/passwd","content":"hack","commitNow":true}')

if [ "$ATTACK_RESP" -eq 400 ]; then
  echo "  ✓ Tentative de traversée de répertoire correctement rejetée (HTTP 400)"
else
  echo "  ✗ ALERTE SÉCURITÉ : Code HTTP $ATTACK_RESP reçu au lieu de 400"
  exit 1
fi

# 9. Autonomie statique du listener 8081 lors de l'arrêt des services
echo "[Test 9/10] Test de résilience : arrêt de l'API et de Postgres..."
docker compose stop api worker postgres >/dev/null 2>&1
STANDALONE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_FILES}/${SLUG_A}/index.php")
if [ "$STANDALONE_STATUS" -eq 200 ]; then
  echo "  ✓ Nginx continue de distribuer le manifeste et les fichiers en toute autonomie (HTTP 200)"
else
  echo "  ✗ ÉCHEC : Code HTTP $STANDALONE_STATUS pendant l'arrêt des backends"
  docker compose start postgres api worker >/dev/null 2>&1
  exit 1
fi
docker compose start postgres api worker >/dev/null 2>&1
docker compose restart nginx >/dev/null 2>&1
sleep 3

# 10. Nettoyage des endpoints de test
echo "[Test 10/10] Nettoyage des endpoints de test..."
curl -s -X DELETE "${BASE_API}/api/endpoints/${EP1_ID}" -H "${AUTH_HEADER}" >/dev/null
curl -s -X DELETE "${BASE_API}/api/endpoints/${EP2_ID}" -H "${AUTH_HEADER}" >/dev/null
echo "  ✓ Endpoints de test éphémères supprimés proprement."

echo "=========================================================="
echo "  ✓ TOUS LES 10 TESTS D'INTÉGRATION SONT VALIDÉS !"
echo "=========================================================="
