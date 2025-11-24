# CI/CD Quick Reference

Quick reference for common CI/CD tasks in Sovereign Communications.

## Status Checks

View workflow runs:
```
https://github.com/Treystu/SC/actions
```

## Running Locally

### Lint Everything
```bash
npm run lint:all
# or
./scripts/lint-all.sh
```

### Build Everything
```bash
npm run build:all
# or
./scripts/build-all.sh
```

### Run Full CI Locally
```bash
npm run ci:local
```

### Platform-Specific

**TypeScript/JavaScript:**
```bash
npm run lint
npm run lint:fix
```

**Kotlin (Android):**
```bash
cd android
ktlint --android "app/src/**/*.kt"
ktlint -F --android "app/src/**/*.kt"  # auto-fix
```

**Swift (iOS):**
```bash
cd ios
swiftlint lint
swiftlint --fix  # auto-fix
```

## Testing

```bash
# Unit tests
npm test

# Core tests with coverage
npm run test:coverage

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Visual regression
npm run test:visual
```

## Building

```bash
# Build core library
npm run build -w core

# Build web app
npm run build -w web

# Build Android debug APK
cd android && ./gradlew assembleDebug

# Build Android release APK
cd android && ./gradlew assembleRelease

# Build iOS (macOS only)
cd ios && swift build
```

## Releases

### Create a Beta Release

**Option 1: Via GitHub UI**
1. Go to Actions → Release
2. Click "Run workflow"
3. Select "beta"
4. Enter version (e.g., "1.0.0")

**Option 2: Via Git Tag**
```bash
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1
```

### Create a Production Release

**Option 1: Via GitHub UI**
1. Go to Actions → Release
2. Click "Run workflow"
3. Select "release"
4. Enter version (e.g., "1.0.0")

**Option 2: Via Git Tag**
```bash
git tag v1.0.0
git push origin v1.0.0
```

## Workflow Files

| Workflow | File | Purpose |
|----------|------|---------|
| Unified CI | `unified-ci.yml` | Main CI pipeline |
| Release | `release.yml` | Automated releases |
| E2E Tests | `e2e.yml` | End-to-end testing |
| Deploy | `deploy.yml` | Deployment pipeline |
| Visual Regression | `visual-regression.yml` | Visual testing |

## Artifacts

Download build artifacts from Actions → Workflow Run → Artifacts section

Available artifacts:
- `core-build` - Core library dist files
- `web-build` - Web app dist files
- `android-debug-apk` - Debug Android APK
- `android-release` - Release Android APK
- `e2e-results-*` - Test results and reports

## Troubleshooting

### "Gradle wrapper not found"
Workflow auto-creates it. Locally:
```bash
cd android
gradle wrapper --gradle-version 8.5
```

### "ktlint not found"
```bash
brew install ktlint
```

### "swiftlint not found"
```bash
brew install swiftlint
```

### Tests Failing
1. Check workflow logs
2. Run tests locally
3. Fix issues
4. Re-run workflow

### Build Failing
1. Check error logs
2. Ensure dependencies installed: `npm ci`
3. Try building locally
4. Check for breaking changes

## Getting Help

- **Documentation**: [docs/ci-cd.md](../docs/ci-cd.md)
- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Repository Issues**: Open an issue for CI/CD problems
