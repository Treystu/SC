# GitHub Issues Export

This directory contains all the exported GitHub issues for the SC project's 10 categories.

## Files

- **`all-issues.json`** - Complete JSON file with all 10 issues (title, body, labels)
- **`issue-01-*.md`** through **`issue-10-*.md`** - Individual markdown files for each issue
- **`create-issues.sh`** - Bash script to create all issues via GitHub CLI

## Quick Usage

### Option 1: Use the Shell Script (Fastest)

```bash
cd docs/issues
./create-issues.sh
```

**Requirements:**
- GitHub CLI (`gh`) installed: https://cli.github.com/
- Authenticated: `gh auth login`
- `jq` installed for JSON parsing

### Option 2: Manual Creation via GitHub Web UI

1. Go to https://github.com/Treystu/SC/issues/new
2. Open one of the `issue-XX-*.md` files
3. Copy the title (first line after #)
4. Copy the body (everything after the --- separator)
5. Add the labels listed at the top
6. Click "Submit new issue"
7. Repeat for all 10 issues

### Option 3: Use GitHub API with curl

```bash
# Set your GitHub token
export GITHUB_TOKEN="your_token_here"

# Create all issues from JSON
cat all-issues.json | jq -c '.[]' | while read issue; do
  title=$(echo $issue | jq -r '.title')
  body=$(echo $issue | jq -r '.body')
  labels=$(echo $issue | jq -r '.labels | join(",")')
  
  curl -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/repos/Treystu/SC/issues \
    -d "{\"title\":\"$title\",\"body\":$(echo $issue | jq -c '.body'),\"labels\":$(echo $issue | jq -c '.labels')}"
  
  sleep 1
done
```

## Issue List

1. **Category 1: Foundation - Protocol & Crypto (Tasks 1-10)** - Current: 8/10, Target: 10/10
   - Labels: enhancement, security, crypto, priority-high

2. **Category 2: Mesh Networking Core (Tasks 11-22)** - Current: 7/10, Target: 10/10
   - Labels: enhancement, networking, mesh, priority-high

3. **Category 3: WebRTC Peer-to-Peer (Tasks 23-32)** - Current: 7/10, Target: 10/10
   - Labels: enhancement, webrtc, networking, priority-high

4. **Category 4: BLE Mesh Mobile (Tasks 33-46)** - Current: 6-9/10, Target: 10/10
   - Labels: enhancement, bluetooth, mobile, priority-medium

5. **Category 5: Peer Discovery (Tasks 47-56)** - Current: 6-7/10, Target: 10/10
   - Labels: enhancement, discovery, ux, priority-medium

6. **Category 6: Android Application (Tasks 57-89)** - Current: 6-7/10, Target: 10/10
   - Labels: enhancement, android, mobile, ui, priority-medium

7. **Category 7: iOS Application (Tasks 90-122)** - Current: 6-7/10, Target: 10/10
   - Labels: enhancement, ios, mobile, ui, priority-medium

8. **Category 8: Web Application (Tasks 123-153)** - Current: 7-8/10, Target: 10/10
   - Labels: enhancement, web, pwa, ui, priority-medium

9. **Category 9: Testing Infrastructure (Tasks 154-175)** - Current: 6-7/10, Target: 10/10
   - Labels: enhancement, testing, ci-cd, quality, priority-high

10. **Category 10: Advanced Features & Polish (Tasks 176-285)** - Current: 3-7/10, Target: 10/10
    - Labels: enhancement, documentation, performance, security, accessibility, priority-low

## Issue Structure

Each issue includes:
- **Title** - Category name with task range
- **Current Score** - Current quality level out of 10
- **Target Score** - Goal of 10/10 for production readiness
- **Overview** - Brief description of the category
- **Tasks and Sub-tasks** - Detailed checklist of all improvements needed
- **Success Criteria** - Requirements for achieving 10/10 rating
- **Implementation Priority** - Phase and timeline information

## Notes

- All issues follow the same comprehensive structure
- Each category has specific success criteria
- Labels help organize by priority and domain
- Issues are designed to be tracked independently but reference the overall roadmap
