#!/usr/bin/env bash
set -euo pipefail

BUMP=${1:-patch}  # patch | minor | major | or explicit version

# Bump all workspace package.jsons + root, no git actions
npm version "$BUMP" --workspaces --include-workspace-root --no-git-tag-version

# Read the resulting version from root package.json
VERSION=$(node -p "require('./package.json').version")

git add -A
git commit -m "chore: release v$VERSION"
git tag "v$VERSION"
git push --follow-tags