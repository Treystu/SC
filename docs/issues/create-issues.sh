#!/bin/bash
# Script to create all GitHub issues using gh CLI
# Usage: ./create-issues.sh

set -e

REPO="Treystu/SC"
ISSUES_FILE="all-issues.json"

echo "Creating GitHub issues for $REPO..."
echo ""

# Check if gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

# Read the JSON file and create issues
issue_count=$(jq length "$ISSUES_FILE")

for i in $(seq 0 $((issue_count - 1))); do
    title=$(jq -r ".[$i].title" "$ISSUES_FILE")
    body=$(jq -r ".[$i].body" "$ISSUES_FILE")
    labels=$(jq -r ".[$i].labels | join(\",\")" "$ISSUES_FILE")
    
    echo "Creating issue $((i + 1))/$issue_count: $title"
    
    # Create the issue
    gh issue create \
        --repo "$REPO" \
        --title "$title" \
        --body "$body" \
        --label "$labels"
    
    echo "✅ Created"
    echo ""
    
    # Small delay to avoid rate limiting
    sleep 1
done

echo "🎉 All $issue_count issues created successfully!"
