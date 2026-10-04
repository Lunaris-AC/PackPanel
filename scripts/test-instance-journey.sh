#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PACKPANEL_CHECK_DIR:?Set PACKPANEL_CHECK_DIR to the directory returned by integration-test.sh}"
node scripts/check-downloaded-launcher.cjs
