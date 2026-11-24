#!/usr/bin/env bash
# Uploads a ZIP to the Chrome Web Store and submits it for review (API v2).
# Used by .github/workflows/release.yml; can also be run by hand.
#
#   CWS_ACCESS_TOKEN=... CWS_PUBLISHER_ID=... CWS_ITEM_ID=... scripts/publish-cws.sh dist/hipcall-webphone-2.1.0.zip
#
# Optional:
#   CWS_PUBLISH_TYPE=STAGED_PUBLISH  hold the approved version until it is published in the dashboard
#   CWS_DRY_RUN=1                    only print the store status, upload nothing
#
# API reference: https://developer.chrome.com/docs/webstore/using-api
set -euo pipefail

ZIP="${1:?usage: publish-cws.sh <zip>}"
: "${CWS_ACCESS_TOKEN:?CWS_ACCESS_TOKEN is not set}"
: "${CWS_PUBLISHER_ID:?CWS_PUBLISHER_ID is not set}"
: "${CWS_ITEM_ID:?CWS_ITEM_ID is not set}"
PUBLISH_TYPE="${CWS_PUBLISH_TYPE:-DEFAULT_PUBLISH}"

API="https://chromewebstore.googleapis.com"
ITEM="publishers/$CWS_PUBLISHER_ID/items/$CWS_ITEM_ID"

summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$*" >> "$GITHUB_STEP_SUMMARY"; echo "$*"; }

call() { # call <method> <url> [curl args...]
  local method="$1" url="$2"
  shift 2
  curl -sS --fail-with-body -X "$method" -H "Authorization: Bearer $CWS_ACCESS_TOKEN" "$@" "$url"
}

fetch_status() { call GET "$API/v2/$ITEM:fetchStatus"; }

# --- Current status ---------------------------------------------------------
status="$(fetch_status)"
echo "Store status: $status"
published="$(jq -r '.publishedItemRevisionStatus.distributionChannels[0].crxVersion // "none"' <<<"$status")"
pending="$(jq -r '.submittedItemRevisionStatus.state // empty' <<<"$status")"
echo "Published version: $published"
[ -n "$pending" ] && echo "Earlier submission: $pending"

if [ "${CWS_DRY_RUN:-0}" = "1" ]; then
  echo "Dry run: nothing uploaded."
  exit 0
fi

# --- Upload -----------------------------------------------------------------
echo "Uploading $ZIP..."
upload="$(call POST "$API/upload/v2/$ITEM:upload" -H "Content-Type: application/zip" --data-binary "@$ZIP")"
echo "Upload response: $upload"
state="$(jq -r '.uploadState // empty' <<<"$upload")"

# Large packages are processed asynchronously; poll for at most 5 minutes.
for _ in $(seq 30); do
  [ "$state" = "IN_PROGRESS" ] || [ "$state" = "UPLOAD_IN_PROGRESS" ] || break
  sleep 10
  state="$(fetch_status | jq -r '.lastAsyncUploadState // empty')"
  echo "Upload state: $state"
done

if [ "$state" != "SUCCEEDED" ]; then
  echo "::error::Upload failed (state: ${state:-unknown}). Check the item in the Chrome Web Store developer dashboard."
  exit 1
fi

# --- Submit for review --------------------------------------------------------
publish="$(call POST "$API/v2/$ITEM:publish" -H "Content-Type: application/json" \
  --data "$(jq -n --arg type "$PUBLISH_TYPE" '{publishType: $type}')")"
echo "Publish response: $publish"
jq -r '.warningInfo.warnings[]? | "::warning::\(.reason): \(.description)"' <<<"$publish"

result="$(jq -r '.state // empty' <<<"$publish")"
case "$result" in
  PENDING_REVIEW | STAGED | PUBLISHED | PUBLISHED_TO_TESTERS)
    summary "Chrome Web Store: $(basename "$ZIP") submitted, state **$result** (previously published: $published)."
    ;;
  *)
    echo "::error::Publish returned state '${result:-unknown}'."
    exit 1
    ;;
esac
