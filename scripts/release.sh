#!/bin/bash
# Bumps the version in manifest.json, tags it and pushes. The tag starts
# .github/workflows/release.yml, which builds the ZIP, creates the GitHub
# release and submits it to the Chrome Web Store.
#
#   scripts/release.sh
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MANIFEST="$PROJECT_ROOT/manifest.json"
cd "$PROJECT_ROOT"

echo -e "${BLUE}=== Hipcall Chrome Extension Release ===${NC}\n"

command -v jq >/dev/null || { echo -e "${RED}Error: jq is required (brew install jq).${NC}"; exit 1; }

# Must be on an up-to-date, clean main.
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${RED}Error: You must be on the 'main' branch to create a release.${NC}"
    echo -e "Current branch: $CURRENT_BRANCH"
    echo -e "Run: git checkout main"
    exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}Error: The working tree has uncommitted changes.${NC}"
    git status --short
    exit 1
fi

echo -e "${BLUE}Fetching main and tags...${NC}"
git fetch origin main --tags
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    echo -e "${RED}Error: Local main differs from origin/main.${NC}"
    echo -e "Run: git pull --ff-only"
    exit 1
fi

# The manifest holds the released version; tags are vX.Y.Z of the same number.
CURRENT=$(jq -r .version "$MANIFEST")
LATEST_TAG=$(git tag --list 'v*' --sort=-version:refname | head -1)
echo -e "\n${GREEN}manifest.json version: $CURRENT${NC}"
echo -e "${GREEN}Latest tag: ${LATEST_TAG:-none}${NC}"

MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)

NEXT_PATCH="v$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="v$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="v$((MAJOR + 1)).0.0"

echo -e "\n${BLUE}Suggested versions:${NC}"
echo "  1) Patch: $NEXT_PATCH"
echo "  2) Minor: $NEXT_MINOR"
echo "  3) Major: $NEXT_MAJOR"
echo "  4) Custom"

read -p "Select version type (1-4): " choice

case $choice in
    1) NEW_TAG=$NEXT_PATCH ;;
    2) NEW_TAG=$NEXT_MINOR ;;
    3) NEW_TAG=$NEXT_MAJOR ;;
    4) read -p "Enter custom version (e.g., v1.2.3): " NEW_TAG ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

if [[ ! $NEW_TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: Invalid version format. Use vX.Y.Z${NC}"
    exit 1
fi
NEW_VERSION=${NEW_TAG#v}

# The Chrome Web Store rejects a version that is not higher than the last one.
if [ "$(printf '%s\n%s\n' "$CURRENT" "$NEW_VERSION" | sort -V | tail -1)" != "$NEW_VERSION" ] || [ "$CURRENT" = "$NEW_VERSION" ]; then
    echo -e "${RED}Error: $NEW_VERSION must be higher than $CURRENT${NC}"
    exit 1
fi
if git rev-parse -q --verify "refs/tags/$NEW_TAG" >/dev/null; then
    echo -e "${RED}Error: Tag $NEW_TAG already exists${NC}"
    exit 1
fi

echo -e "\n${BLUE}Commits since ${LATEST_TAG:-the beginning}:${NC}"
if [ -z "$LATEST_TAG" ]; then
    git log --oneline -20
else
    git log --oneline "$LATEST_TAG"..HEAD | head -20
fi

echo -e "\n${YELLOW}This will set manifest.json to $NEW_VERSION, push it to main and push tag $NEW_TAG.${NC}"
echo -e "${YELLOW}The tag submits the extension to the Chrome Web Store (after approval in GitHub).${NC}"
read -p "Proceed? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Cancelled"
    exit 0
fi

echo -e "\n${BLUE}Updating manifest.json to $NEW_VERSION...${NC}"
# `-i.bak` works on both BSD (macOS) and GNU sed; a bare `-i` fails on macOS.
sed -i.bak -E "s/(\"version\": *\")[^\"]*\"/\1$NEW_VERSION\"/" "$MANIFEST"
rm -f "$MANIFEST.bak"
if [ "$(jq -r .version "$MANIFEST")" != "$NEW_VERSION" ]; then
    echo -e "${RED}Error: Could not update the version in manifest.json${NC}"
    git checkout -- "$MANIFEST"
    exit 1
fi

# Same checks as CI, before anything is pushed.
if ! ZIP=$("$SCRIPT_DIR/package.sh"); then
    git checkout -- "$MANIFEST"
    exit 1
fi
echo -e "${GREEN}Package OK: $ZIP${NC}"

git add "$MANIFEST"
git commit -m "chore: bump version to $NEW_TAG"

read -p "Enter release message (optional): " MESSAGE
if [ -z "$MESSAGE" ]; then
    MESSAGE="Release $NEW_TAG"
fi
git tag -a "$NEW_TAG" -m "$MESSAGE"

echo -e "${BLUE}Pushing commit and tag to origin...${NC}"
git push --atomic origin main "$NEW_TAG"

echo -e "\n${GREEN}Success! Tag $NEW_TAG has been pushed.${NC}"
echo -e "${GREEN}GitHub Actions will now build the release and submit it to the Chrome Web Store.${NC}"
echo -e "\nApprove and monitor the run at: https://github.com/hipcall/chrome_extension/actions"
