#!/usr/bin/env bash
# One-time Google Cloud setup that lets GitHub Actions publish to the Chrome Web
# Store without a stored secret (Workload Identity Federation). Safe to re-run.
#
# Run it in Google Cloud Shell (https://shell.cloud.google.com, gcloud is
# preinstalled) as someone who can create service accounts in the project:
#
#   bash setup-google.sh <gcp-project-id>
#
# Only tags v* of hipcall/chrome_extension, in jobs that use the
# 'chrome-web-store' environment, can get a token.
set -euo pipefail

PROJECT_ID="${1:?usage: setup-google.sh <gcp-project-id>}"

GITHUB_REPO="hipcall/chrome_extension"
GITHUB_REPO_ID="800341476"   # gh api repos/hipcall/chrome_extension --jq .id
GITHUB_OWNER_ID="82726069"   # gh api repos/hipcall/chrome_extension --jq .owner.id
ENVIRONMENT="chrome-web-store"

SA_NAME="chrome-web-store-publisher"
POOL="github"
PROVIDER="chrome-extension"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "Enabling APIs..."
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

echo "Service account $SA..."
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Chrome Web Store publisher (GitHub Actions)"

echo "Workload identity pool '$POOL'..."
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global \
    --display-name="GitHub Actions"

echo "OIDC provider '$PROVIDER'..."
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" \
    --display-name="$GITHUB_REPO" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id" \
    --attribute-condition="assertion.repository_owner_id == '$GITHUB_OWNER_ID' && assertion.repository_id == '$GITHUB_REPO_ID' && assertion.ref.startsWith('refs/tags/v') && assertion.environment == '$ENVIRONMENT'"

echo "Allowing the repository to act as the service account..."
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository_id/$GITHUB_REPO_ID" \
  >/dev/null

cat <<EOF

Done. Next steps:

1) Chrome Web Store developer dashboard → Account → API access:
   add this service account:

     $SA

2) GitHub repository variables (Settings → Secrets and variables → Actions → Variables):

     CWS_WIF_PROVIDER     projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
     CWS_SERVICE_ACCOUNT  $SA
     CWS_PUBLISHER_ID     (dashboard → Account / Settings)
     CWS_ITEM_ID          (32-letter extension ID, dashboard → item → Package)
EOF
