#!/usr/bin/env bash
#
# publish.sh — rebuild data.json from the QA reports and push to GitHub.
#
# Run it manually after new reports come in, or set up a daily cron job:
#   0 20 * * * cd "/path/to/work analyser" && ./publish.sh >> /tmp/qa-publish.log 2>&1
#
# Requires: node, git

set -euo pipefail

cd "$(dirname "$0")"

echo "▶ Building data.json from reports…"
node build.js

echo
echo "▶ Staging & committing…"
git add data.json reports/
if git diff --cached --quiet; then
  echo "  No changes since last build — nothing to commit."
  exit 0
fi

git commit -m "chore: daily performance update $(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo
echo "▶ Pushing to origin…"
git push origin

echo
echo "✓ Done. GitHub Pages will update shortly."