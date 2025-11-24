# GitHub Actions Workflows

This repository uses several GitHub Actions workflows for continuous integration and deployment.

## Active Workflows

### Unified CI/CD
![Unified CI/CD](https://github.com/Treystu/SC/workflows/Unified%20CI%2FCD/badge.svg)

**File**: `.github/workflows/unified-ci.yml`

Main CI pipeline that runs on every push and pull request. Includes:
- Linting for TypeScript, Kotlin, and Swift
- Building for Web, Android, and iOS
- Unit tests across multiple Node versions
- Integration tests
- E2E tests
- Security audits

**Triggers**: Push to main/develop/copilot/**, PRs to main/develop, manual dispatch

---

### Release
![Release](https://github.com/Treystu/SC/workflows/Release/badge.svg)

**File**: `.github/workflows/release.yml`

Automated release workflow for creating beta, alpha, and production releases.

**Triggers**: Version tags (v*.*.*), manual dispatch

---

### E2E Tests
![E2E Tests](https://github.com/Treystu/SC/workflows/E2E%20Tests/badge.svg)

**File**: `.github/workflows/e2e.yml`

Comprehensive end-to-end testing including mobile platforms.

**Triggers**: Push to main/develop, PRs, nightly schedule, manual dispatch

---

### Deploy
![Deploy](https://github.com/Treystu/SC/workflows/Deploy/badge.svg)

**File**: `.github/workflows/deploy.yml`

Deployment workflow for staging and production environments.

**Triggers**: Push to main, version tags, manual dispatch

---

### Visual Regression
![Visual Regression](https://github.com/Treystu/SC/workflows/Visual%20Regression/badge.svg)

**File**: `.github/workflows/visual-regression.yml`

Visual regression testing to catch unintended UI changes.

**Triggers**: Push to main/develop, PRs

---

## Workflow Status

You can view the status of all workflows at:
https://github.com/Treystu/SC/actions

## Adding Badges to Documentation

To add workflow badges to markdown files:

```markdown
![Workflow Name](https://github.com/Treystu/SC/workflows/Workflow%20Name/badge.svg)
```

For specific branch:
```markdown
![Workflow Name](https://github.com/Treystu/SC/workflows/Workflow%20Name/badge.svg?branch=main)
```

As a link:
```markdown
[![Workflow Name](https://github.com/Treystu/SC/workflows/Workflow%20Name/badge.svg)](https://github.com/Treystu/SC/actions/workflows/workflow-file.yml)
```

## Notification Settings

To configure GitHub Actions notifications:
1. Go to https://github.com/settings/notifications
2. Under "Actions" configure:
   - Email notifications for failed workflows
   - Web notifications for workflow runs
   - Custom notification rules per workflow
