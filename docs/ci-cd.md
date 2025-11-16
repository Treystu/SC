# CI/CD Documentation

This document describes the comprehensive CI/CD workflows implemented for Sovereign Communications across all platforms (Web, Android, iOS).

## Table of Contents

- [Overview](#overview)
- [Workflows](#workflows)
  - [Unified CI](#unified-ci)
  - [Release Workflow](#release-workflow)
  - [E2E Tests](#e2e-tests)
  - [Visual Regression](#visual-regression)
  - [Deploy](#deploy)
- [Platform-Specific Details](#platform-specific-details)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)

## Overview

The Sovereign Communications project uses GitHub Actions for continuous integration and deployment. The workflows are designed to:

- **Build** all platforms (Web, Android, iOS)
- **Lint** code using platform-specific tools (ESLint, ktlint, SwiftLint)
- **Test** comprehensively (unit, integration, E2E)
- **Release** automatically with proper versioning
- **Deploy** to staging and production environments

## Workflows

### Unified CI

**File**: `.github/workflows/unified-ci.yml`

**Triggers**:
- Push to `main`, `develop`, or `copilot/**` branches
- Pull requests to `main` or `develop`
- Manual trigger via workflow_dispatch

**Jobs**:

#### 1. Linting Jobs

- **lint-typescript**: Runs ESLint on TypeScript/JavaScript code
  - Platform: Ubuntu
  - Tool: ESLint
  - Scope: Core library and Web application
  - Timeout: 10 minutes

- **lint-kotlin**: Runs ktlint on Android Kotlin code
  - Platform: Ubuntu
  - Tool: ktlint 1.0.1
  - Scope: Android app (`android/app/src/**/*.kt`)
  - Timeout: 10 minutes
  - Status: Currently soft-fail (continue-on-error: true)

- **lint-swift**: Runs SwiftLint on iOS Swift code
  - Platform: macOS-14
  - Tool: SwiftLint (via Homebrew)
  - Scope: iOS app
  - Timeout: 10 minutes
  - Status: Currently soft-fail (continue-on-error: true)

#### 2. Build Jobs

- **build-core**: Builds the core TypeScript library
  - Depends on: lint-typescript
  - Platform: Ubuntu
  - Output: `core/dist/` (uploaded as artifact)
  - Timeout: 10 minutes

- **build-web**: Builds the web application
  - Depends on: lint-typescript, build-core
  - Platform: Ubuntu
  - Tool: Vite
  - Output: `web/dist/` (uploaded as artifact)
  - Timeout: 10 minutes

- **build-android**: Builds Android debug APK
  - Depends on: lint-kotlin
  - Platform: Ubuntu
  - Tool: Gradle 8.5
  - Output: Debug APK (uploaded as artifact)
  - Special: Auto-creates Gradle wrapper if missing
  - Timeout: 20 minutes

- **build-ios**: Builds iOS application
  - Depends on: lint-swift
  - Platform: macOS-14
  - Tool: Swift Package Manager / Xcode
  - Output: iOS build artifacts
  - Timeout: 20 minutes

#### 3. Test Jobs

- **test-core**: Unit tests for core library
  - Depends on: build-core
  - Platform: Ubuntu
  - Node versions: 18, 20, 22 (matrix)
  - Coverage: Uploaded to Codecov (Node 20 only)
  - Timeout: 15 minutes

- **test-android**: Android unit tests
  - Depends on: build-android
  - Platform: Ubuntu
  - Tool: Gradle test task
  - Timeout: 15 minutes
  - Status: Currently soft-fail

- **test-ios**: iOS unit tests
  - Depends on: build-ios
  - Platform: macOS-14
  - Tool: `swift test`
  - Timeout: 15 minutes
  - Status: Currently soft-fail

- **test-integration**: Integration tests
  - Depends on: build-web
  - Platform: Ubuntu
  - Uses: Downloaded build artifacts
  - Timeout: 20 minutes
  - Status: Currently soft-fail

- **test-e2e-web**: End-to-end web tests
  - Depends on: build-web
  - Platform: Ubuntu
  - Browsers: Chromium, Firefox (matrix)
  - Tool: Playwright
  - Timeout: 20 minutes
  - Status: Currently soft-fail

#### 4. Security & Final Checks

- **security-audit**: Security vulnerability scanning
  - Platform: Ubuntu
  - Tools: npm audit, audit-ci
  - Level: Moderate and above
  - Status: Currently soft-fail
  - Timeout: 10 minutes

- **ci-success**: Final status aggregation
  - Depends on: All previous jobs
  - Checks: Critical jobs (lint-typescript, build-core, build-web, test-core)
  - Fails if: Any critical job fails

### Release Workflow

**File**: `.github/workflows/release.yml`

**Triggers**:
- Push of version tags (`v*.*.*`, `v*.*.*-beta.*`, `v*.*.*-alpha.*`)
- Manual trigger with version and release type selection

**Release Types**:
- **Alpha**: Pre-alpha releases with timestamp (`v1.0.0-alpha.20231215120000`)
- **Beta**: Beta releases with timestamp (`v1.0.0-beta.20231215120000`)
- **Release**: Production releases (`v1.0.0`)

**Jobs**:

#### 1. prepare-release
Determines version number and release metadata

**Outputs**:
- `version`: The release version
- `is_prerelease`: Whether this is a pre-release
- `release_name`: Human-readable release name

#### 2. build-all
Builds web application with updated version

**Steps**:
- Updates package.json versions
- Builds core library
- Builds web application (production mode)
- Creates compressed distribution archive
- Uploads artifacts

#### 3. build-android
Builds Android release APK

**Steps**:
- Updates Android version code and name
- Builds release APK
- Attempts to build App Bundle
- Signs APK (if keystore configured)
- Uploads APK artifact

#### 4. build-ios
Builds iOS application

**Steps**:
- Updates iOS version
- Builds iOS archive
- Creates build information
- Uploads artifacts

**Note**: Full IPA creation requires code signing certificates

#### 5. test-release
Runs full test suite on release build

**Steps**:
- Runs core unit tests with coverage
- Runs integration tests

#### 6. create-release
Creates GitHub release with all artifacts

**Steps**:
- Downloads all build artifacts
- Generates changelog from git commits
- Creates GitHub release (draft or published)
- Attaches all platform artifacts
- Optionally publishes to npm

#### 7. notify-completion
Sends notification about release status

### E2E Tests

**File**: `.github/workflows/e2e.yml`

**Purpose**: Comprehensive end-to-end testing across platforms

**Triggers**:
- Push to main/develop
- Pull requests
- Nightly schedule (2 AM UTC)
- Manual trigger with mobile test option

**Jobs**:
- `e2e-web`: Tests in Chromium, Firefox, WebKit
- `e2e-cross-platform-web`: Tests web-to-web communication
- `e2e-android`: Tests Android app (schedule/manual only)
- `e2e-ios`: Tests iOS app (schedule/manual only)
- `visual-regression`: Visual diff testing
- `performance`: Performance benchmarking

### Visual Regression

**File**: `.github/workflows/visual-regression.yml`

**Purpose**: Detect unintended UI changes

**Tool**: Playwright visual comparison

**Output**: Visual diff artifacts on failure

### Deploy

**File**: `.github/workflows/deploy.yml`

**Purpose**: Deploy to staging and production

**Environments**:
- **Staging**: Auto-deploy on push to main
- **Production**: Deploy on version tags with canary rollout

**Features**:
- Canary deployment (10% traffic)
- Health monitoring
- Automatic rollback on failure

## Platform-Specific Details

### TypeScript/Web

**Linting**:
```bash
npm run lint
```
- Tool: ESLint with TypeScript plugin
- Config: `.eslintrc.js`
- Scope: `**/*.ts`, `**/*.tsx`

**Building**:
```bash
npm run build -w core    # Build core library
npm run build -w web     # Build web app
```

**Testing**:
```bash
npm test -w core              # Unit tests
npm run test:integration      # Integration tests
npm run test:e2e             # E2E tests
```

### Android/Kotlin

**Linting**:
```bash
ktlint --android "app/src/**/*.kt"
```
- Tool: ktlint 1.0.1
- Installed: Via direct download in CI
- Local: Can install via `brew install ktlint`

**Building**:
```bash
cd android
./gradlew assembleDebug     # Debug APK
./gradlew assembleRelease   # Release APK
./gradlew bundleRelease     # App Bundle
```

**Testing**:
```bash
./gradlew test              # Unit tests
./gradlew connectedAndroidTest  # Instrumented tests
```

**Gradle Wrapper**: Auto-created in CI if missing

### iOS/Swift

**Linting**:
```bash
swiftlint lint
```
- Tool: SwiftLint
- Installed: Via Homebrew in CI
- Config: `.swiftlint.yml` (if present)

**Building**:
```bash
cd ios
swift build                 # SPM build
# Or with Xcode:
xcodebuild -scheme SovereignCommunications \
  -sdk iphonesimulator \
  -configuration Debug
```

**Testing**:
```bash
swift test                  # Unit tests
# Or with Xcode:
xcodebuild test -scheme SovereignCommunications
```

## Release Process

### Automated Release (Recommended)

#### Creating a Beta Release

1. **Via GitHub UI**:
   - Go to Actions → Release workflow
   - Click "Run workflow"
   - Select "beta" as release type
   - Enter version (e.g., "1.0.0")
   - Click "Run workflow"

2. **Via Git Tag**:
   ```bash
   git tag v1.0.0-beta.1
   git push origin v1.0.0-beta.1
   ```

#### Creating a Production Release

1. **Via GitHub UI**:
   - Go to Actions → Release workflow
   - Click "Run workflow"
   - Select "release" as release type
   - Enter version (e.g., "1.0.0")
   - Click "Run workflow"

2. **Via Git Tag**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

### What Happens During Release

1. **Version Update**: All package.json files and platform configs updated
2. **Build**: All platforms built in production mode
3. **Test**: Full test suite runs
4. **Package**: Artifacts created:
   - Web: `web-{version}.tar.gz`
   - Android: `sovereign-communications-{version}.apk`
   - iOS: Build info and artifacts
5. **Release**: GitHub release created with:
   - Auto-generated changelog
   - All platform artifacts attached
   - Installation instructions
6. **Publish**: Optionally published to npm (if configured)

### Manual Release Steps

If automated release fails, you can manually:

1. Update versions in `package.json` files
2. Build all platforms locally
3. Run tests
4. Create GitHub release manually
5. Upload artifacts

## Artifacts

All workflows produce artifacts that are stored for 7-90 days:

| Artifact | Retention | Description |
|----------|-----------|-------------|
| `core-build` | 7 days | Core library dist files |
| `web-build` | 7 days | Web app dist files |
| `android-debug-apk` | 7 days | Debug Android APK |
| `android-release` | 90 days | Release Android APK |
| `ios-release` | 90 days | iOS build artifacts |
| `e2e-results-*` | 7 days | E2E test results and reports |
| `web-release` | 90 days | Web distribution package |

## Environment Variables

### Required

None - the workflows work out of the box.

### Optional

| Variable | Purpose | Used In |
|----------|---------|---------|
| `CODECOV_TOKEN` | Upload coverage to Codecov | unified-ci.yml |
| `NPM_TOKEN` | Publish to npm registry | release.yml |
| `ANDROID_KEYSTORE` | Sign Android APK | release.yml |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | release.yml |

## Badges

Add these badges to your README:

```markdown
![CI Status](https://github.com/Treystu/SC/workflows/Unified%20CI%2FCD/badge.svg)
![Release](https://github.com/Treystu/SC/workflows/Release/badge.svg)
[![codecov](https://codecov.io/gh/Treystu/SC/branch/main/graph/badge.svg)](https://codecov.io/gh/Treystu/SC)
```

## Troubleshooting

### Build Failures

#### "Gradle wrapper not found"
- **Cause**: Missing `gradlew` in android directory
- **Solution**: The workflow auto-creates it, but you can also run:
  ```bash
  cd android
  gradle wrapper --gradle-version 8.5
  ```

#### "ESLint not found"
- **Cause**: Dependencies not installed
- **Solution**: Run `npm ci` in root directory

#### "SwiftLint command not found" (local)
- **Cause**: SwiftLint not installed
- **Solution**: 
  ```bash
  brew install swiftlint
  ```

### Test Failures

#### Unit tests fail
- Check test output in job logs
- Run locally: `npm test -w core`
- Some tests currently allowed to fail (soft-fail)

#### E2E tests timeout
- Increase timeout in workflow file
- Check if Playwright browsers installed: `npx playwright install`
- Run locally: `npm run test:e2e`

### Release Failures

#### "Failed to create release"
- Check permissions: Workflow needs `contents: write`
- Verify tag format: Must be `v*.*.*` or `v*.*.*-beta.*`
- Check if release already exists

#### "APK not signed"
- Expected for debug builds and unsigned releases
- For production, configure `ANDROID_KEYSTORE` secret

## Performance Optimization

### Caching

Workflows use aggressive caching:
- **npm**: Package dependencies cached automatically
- **Gradle**: Build cache and wrapper cached
- **Android AVD**: Emulator images cached

### Parallel Execution

- Linting runs in parallel for all platforms
- Tests run in parallel across Node versions
- E2E tests run in parallel across browsers

### Resource Limits

| Job | Timeout | Reason |
|-----|---------|--------|
| Linting | 10 min | Fast static analysis |
| Building | 10-20 min | Compilation time |
| Unit tests | 15 min | Comprehensive test suite |
| E2E tests | 20 min | Browser automation |
| Android emulator | 60 min | Emulator setup overhead |
| iOS simulator | 60 min | Xcode build time |

## Contributing

When adding new workflows or modifying existing ones:

1. Test locally with `act` if possible
2. Use descriptive job names
3. Add appropriate timeouts
4. Include artifact uploads for debugging
5. Use `continue-on-error` for non-critical jobs
6. Document new workflows in this file
7. Add appropriate caching for dependencies

## Support

For issues with CI/CD:
1. Check job logs in GitHub Actions
2. Review this documentation
3. Check [GitHub Actions documentation](https://docs.github.com/en/actions)
4. Open an issue in the repository

## Future Enhancements

Planned improvements:
- [ ] Add mutation testing to CI
- [ ] Implement dependency scanning (Dependabot/Renovate)
- [ ] Add automated security scanning (Snyk/SonarQube)
- [ ] Implement progressive rollouts for web deployments
- [ ] Add performance regression detection
- [ ] Implement automatic changelog generation from commits
- [ ] Add deployment to mobile app stores (Google Play, App Store)
- [ ] Implement CD to TestFlight for iOS
- [ ] Add automatic versioning based on commit messages
