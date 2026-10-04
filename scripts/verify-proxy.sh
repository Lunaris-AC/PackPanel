#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo 'Usage: verify-proxy.sh ADMIN_HTTPS_URL MANIFEST_HTTPS_URL RELEASE_FILE_HTTPS_URL' >&2
  exit 2
fi
admin_url=${1%/}
manifest_url=$2
release_url=$3
for url in "$admin_url" "$manifest_url" "$release_url"; do
  [[ "$url" == https://* ]] || { echo 'Use HTTPS URLs with trusted certificates.' >&2; exit 2; }
done

check_dir=$(mktemp -d)
trap 'rm -rf -- "$check_dir"' EXIT
curl --fail --silent --show-error "$admin_url/api/health" -o "$check_dir/health"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$check_dir/health"
curl --fail --silent --show-error -D "$check_dir/manifest-headers" "$manifest_url" -o "$check_dir/manifest"
grep -qi 'content-type:.*application/json' "$check_dir/manifest-headers"
grep -Eq '^[[:space:]]*[\[{]' "$check_dir/manifest"
grep -qi 'cache-control:.*no-store' "$check_dir/manifest-headers"
if grep -qiE 'challenge-platform|cf-browser-verification|cf-turnstile' "$check_dir/manifest"; then
  echo 'A browser challenge blocks the public manifest.' >&2
  exit 1
fi
range_status=$(curl --fail --silent --show-error -D "$check_dir/release-headers" \
  -H 'Range: bytes=0-4' -o "$check_dir/range" -w '%{http_code}' "$release_url")
test "$range_status" = 206
test "$(wc -c < "$check_dir/range")" -eq 5
grep -qi 'cache-control:.*immutable' "$check_dir/release-headers"
echo 'PASS: HTTPS health, JSON manifest, fresh manifest cache policy, immutable release and HTTP Range.'
