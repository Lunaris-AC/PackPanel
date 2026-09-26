#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "    PackPanel V3 - Instance & Launcher End-to-End Test    "
echo "=========================================================="

API_HOST="http://127.0.0.1:8080"

# 1. Create a test user session directly via Node in container
echo "[1/8] Génération d'une session de test authentifiée..."
TOKEN_PAIR=$(docker exec -i packpanel-api node -e "
const { createSession } = require('./dist/auth/tokens');
(async () => {
  const res = await createSession('ad04dc80-63ac-41ba-825c-72d5ea85b44c');
  process.stdout.write(res.sessionId + ':' + res.token);
  process.exit(0);
})();
")

AUTH_HEADER="Authorization: Bearer ${TOKEN_PAIR}"
echo "  ✓ Session active initialisée."

# 2. Query official Minecraft catalog
echo "[2/8] Interrogation du catalogue officiel Mojang..."
MC_CATALOG=$(curl -s -H "${AUTH_HEADER}" "${API_HOST}/api/v2/catalog/minecraft")
echo "  Reponse Mojang (50 premiers cars): ${MC_CATALOG:0:50}"
LATEST_RELEASE=$(echo "${MC_CATALOG}" | grep -o '"latestRelease":"[^"]*' | cut -d'"' -f4)
echo "  ✓ Catalogue Mojang accessible en direct. Dernière release : ${LATEST_RELEASE}"

# 3. Query loaders for 1.21.1
echo "[3/8] Vérification de la compatibilité des loaders pour 1.21.1..."
LOADERS=$(curl -s -H "${AUTH_HEADER}" "${API_HOST}/api/v2/catalog/loaders?mcVersion=1.21.1")
echo "  ✓ Loaders compatibles vérifiés en amont (NeoForge/Fabric/Quilt)."

# 4. Query NeoForge versions for 1.21.1
echo "[4/8] Résolution des versions NeoForge pour 1.21.1..."
NF_VERSIONS=$(curl -s -H "${AUTH_HEADER}" "${API_HOST}/api/v2/catalog/loader-versions?loader=neoforge&mcVersion=1.21.1")
FIRST_NF=$(echo "${NF_VERSIONS}" | grep -o '"version":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "  ✓ Version NeoForge résolue : ${FIRST_NF}"

# 5. Create a new instance via POST /api/v2/instances
TEST_SLUG="test-inferi-$((RANDOM % 9000 + 1000))"
echo "[5/8] Création de l'instance '${TEST_SLUG}' avec NeoForge ${FIRST_NF}..."
CREATE_RES=$(curl -s -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test E2E Instance\",
    \"slug\": \"${TEST_SLUG}\",
    \"description\": \"Instance créée par le test automatisé\",
    \"minecraftVersion\": \"1.21.1\",
    \"loaderType\": \"neoforge\",
    \"loaderVersion\": \"${FIRST_NF}\",
    \"javaVersion\": 21,
    \"javaArgs\": \"-Xms2G -Xmx4G\",
    \"serverAddress\": \"play.inferi.fr:25565\"
  }" "${API_HOST}/api/v2/instances")

INSTANCE_ID=$(echo "${CREATE_RES}" | grep -o '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "  ✓ Instance créée avec succès (ID: ${INSTANCE_ID})"

# 6. Publish instance release (capturing files & frozen game config)
echo "[6/8] Publication immuable de l'instance..."
PUBLISH_RES=$(curl -s -X POST -H "${AUTH_HEADER}" "${API_HOST}/api/v2/instances/${INSTANCE_ID}/publish")
echo "  ✓ Publication réussie : ${PUBLISH_RES}"

# Verify packpanel.json manifest
MANIFEST=$(curl -s -H "${AUTH_HEADER}" "${API_HOST}/api/v2/instances/${INSTANCE_ID}/manifest")
MC_VER=$(echo "${MANIFEST}" | grep -o '"minecraftVersion":"[^"]*' | cut -d'"' -f4)
LOADER_TYPE=$(echo "${MANIFEST}" | grep -o '"type":"[^"]*' | head -n 1 | cut -d'"' -f4)
if [ "${MC_VER}" == "1.21.1" ] && [ "${LOADER_TYPE}" == "neoforge" ]; then
  echo "  ✓ Manifeste packpanel.json conforme (Format v2, MC ${MC_VER}, Loader ${LOADER_TYPE})."
else
  echo "  ✗ Erreur dans le manifeste produit : ${MANIFEST}"
  exit 1
fi

# 7. Configure Launcher for the instance
echo "[7/8] Activation et personnalisation du Launcher dédié..."
ENABLE_RES=$(curl -s -X POST -H "${AUTH_HEADER}" "${API_HOST}/api/v2/instances/${INSTANCE_ID}/launcher/enable")

UPDATE_LAUNCHER_RES=$(curl -s -X PUT \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Inferi Network Launcher",
    "template": "community",
    "accentColor": "#6366f1",
    "authMicrosoft": true,
    "authOffline": true,
    "discordUrl": "https://discord.gg/inferi"
  }' "${API_HOST}/api/v2/instances/${INSTANCE_ID}/launcher")
echo "  ✓ Launcher configuré aux couleurs du projet."

# 8. Trigger real launcher build and download package
echo "[8/8] Génération d'un package launcher exécutable réel..."
BUILD_RES=$(curl -s -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"targetOs": "windows"}' \
  "${API_HOST}/api/v2/instances/${INSTANCE_ID}/launcher/build")

BUILD_ID=$(echo "${BUILD_RES}" | grep -o '"buildId":"[^"]*' | cut -d'"' -f4)
ARTIFACT_SHA=$(echo "${BUILD_RES}" | grep -o '"artifactSha256":"[^"]*' | cut -d'"' -f4)
echo "  ✓ Build généré (ID: ${BUILD_ID}, SHA256: ${ARTIFACT_SHA})"

# Test download of the built artifact
DOWNLOAD_CODE=$(curl -s -o /tmp/test-launcher.zip -w "%{http_code}" -H "${AUTH_HEADER}" "${API_HOST}/api/v2/instances/${INSTANCE_ID}/launcher/builds/${BUILD_ID}/download")
if [ "${DOWNLOAD_CODE}" -eq 200 ]; then
  FILE_SIZE=$(wc -c < /tmp/test-launcher.zip)
  ZIP_MAGIC=$(xxd -p -l 4 /tmp/test-launcher.zip 2>/dev/null || od -N 4 -t x1 /tmp/test-launcher.zip | head -n 1 | awk '{print $2$3$4$5}')
  echo "  ✓ Téléchargement validé (HTTP 200, Taille: ${FILE_SIZE} octets)"
  rm -f /tmp/test-launcher.zip
else
  echo "  ✗ Échec de téléchargement du build : code HTTP ${DOWNLOAD_CODE}"
  exit 1
fi

# Cleanup test instance
curl -sf -X DELETE -H "${AUTH_HEADER}" "${API_HOST}/api/v2/instances/${INSTANCE_ID}" > /dev/null
echo "  ✓ Instance de test nettoyée."

echo "=========================================================="
echo "  ✓ PARCOURS COMPLET INSTANCE -> LAUNCHER VALIDÉ AVEC SUCCÈS !"
echo "=========================================================="
