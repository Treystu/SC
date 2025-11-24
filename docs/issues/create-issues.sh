#!/bin/bash
# Bulk create GitHub issues from PR #4 exported JSON
set -euo pipefail
REPO="${REPO:-Treystu/SC}"
JSON="docs/issues/all-issues.json"
REMOTE_SHA="c2ffcc56459e8432d70982492741c4dc4c1b7112"
REMOTE_URL="https://raw.githubusercontent.com/Treystu/SC/${REMOTE_SHA}/docs/issues/all-issues.json"
for dep in gh jq curl; do command -v $dep >/dev/null || { echo "Missing $dep"; exit 1; }; done
gh auth status >/dev/null || { echo "Not authenticated. Run: gh auth login"; exit 1; }
[ -f "$JSON" ] || { echo "Downloading issue data..."; curl -fsSL "$REMOTE_URL" -o "$JSON"; }
count=$(jq length "$JSON")
echo "Creating $count issues in $REPO..."
for i in $(seq 0 $((count-1))); do
  title=$(jq -r ".[$i].title" "$JSON")
  body=$(jq -r ".[$i].body" "$JSON")
  mapfile -t labels < <(jq -r ".[$i].labels[]" "$JSON")
  args=(gh issue create --repo "$REPO" --title "$title" --body "$body")
  for l in "${labels[@]}"; do args+=(--label "$l"); done
  echo "→ $((i+1))/$count: $title"
  "${args[@]}"
  sleep 0.5
done
echo "Done." 
