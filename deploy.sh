#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")" || exit 1

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Deployment must be run from the main branch." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit or stash local changes before deploying." >&2
  exit 1
fi

deploy_branch="gh-pages-deploy"
if git show-ref --verify --quiet "refs/heads/$deploy_branch"; then
  echo "Local branch $deploy_branch already exists; remove it before deploying." >&2
  exit 1
fi

cleanup() {
  if [[ "$(git branch --show-current)" == "$deploy_branch" ]]; then
    git switch main
  fi
  git branch -D "$deploy_branch" >/dev/null 2>&1 || true
  rm -rf docs
}
trap cleanup EXIT

bun run build:gh
git switch -c "$deploy_branch"
mv dist docs
touch docs/.nojekyll
git add -f docs
git commit -m "Generate pages: $(date '+%Y-%m-%dT%H:%M:%S%z')"
git push --force origin HEAD:gh-pages
