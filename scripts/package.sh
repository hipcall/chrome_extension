#!/usr/bin/env bash
# Builds dist/hipcall-webphone-<version>.zip with only the files the extension
# loads, after checking the JSON files. Prints the path of the ZIP.
#
#   scripts/package.sh
#
# Needs jq and zip (preinstalled on GitHub runners; `brew install jq` on macOS).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

FILES=(manifest.json service_worker.js _locales fonts icons js src)

for f in manifest.json _locales/*/messages.json; do
  jq empty "$f" || { echo "Invalid JSON: $f" >&2; exit 1; }
done

# Every language must have exactly the keys of the English file.
for f in _locales/*/messages.json; do
  if ! diff <(jq -r 'keys[]' _locales/en/messages.json) <(jq -r 'keys[]' "$f") >&2; then
    echo "Keys of $f differ from _locales/en/messages.json (< missing, > extra)" >&2
    exit 1
  fi
done

VERSION="$(jq -r .version manifest.json)"
OUT="dist/hipcall-webphone-$VERSION.zip"

mkdir -p dist
rm -f "$OUT"
zip -qrX "$OUT" "${FILES[@]}" -x '*.DS_Store'
echo "$OUT"
