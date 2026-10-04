#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PACKPANEL_TOKEN:?Set PACKPANEL_TOKEN to an administrator session pair}"
command -v node >/dev/null || { echo 'Node.js 24 and npm ci are required for the release checks.' >&2; exit 1; }
node scripts/check-release.cjs
