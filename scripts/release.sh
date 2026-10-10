#!/usr/bin/env bash
# Usage: scripts/release.sh [patch|minor|major|<version>] [--dry-run]
#
# Bumps the version in package.json, commits "Release: vX.Y.Z", tags it and pushes. --dry-run only
# prints the version it would release and leaves package.json as it was.
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP=patch
DRY_RUN=false
for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=true ;;
		-*) echo "Unknown option: $arg" >&2; exit 1 ;;
		*) BUMP=$arg ;;
	esac
done

# Also in a dry run: restoring package.json afterwards must never throw away uncommitted work.
if [ -n "$(git status --porcelain)" ]; then
	echo "The working tree has uncommitted changes; commit or stash them first." >&2
	exit 1
fi

bun pm version "$BUMP" --no-git-tag-version >/dev/null
VERSION=$(bun -p "require('./package.json').version")

if [ "$DRY_RUN" = true ]; then
	git checkout -- package.json
	echo "Would release v$VERSION"
	exit 0
fi

git add package.json
git commit -m "Release: v$VERSION"
git tag "v$VERSION"
git push && git push --tags
