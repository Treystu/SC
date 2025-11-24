# CI/CD Workflows

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Sovereign Communications monorepo.

## Overview

The project uses GitHub Actions for all CI/CD workflows. The workflows are designed to:

1. **Validate code quality** across all platforms (Web, Android, iOS)
2. **Build and test** all components
3. **Create releases** with automated versioning
4. **Deploy** to various environments

## Workflows

### 1. Unified CI/CD (`unified-ci.yml`)

**Triggers:**
- Push to `main`, `develop`, or `copilot/**` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Jobs:**

#### Linting
- **lint-typescript**: ESLint for TypeScript/JavaScript (Web + Core)
- **lint-kotlin**: ktlint for Android code
- **lint-swift**: SwiftLint for iOS code

#### Builds
- **build-core**: Core TypeScript library
- **build-web**: Web application (Vite build)
- **build-android**: Android debug APK
- **build-ios**: iOS application for simulator

#### Tests
- **test-core**: Unit tests for core library (Node 18, 20, 22)
- **test-android**: Android unit tests
- **test-ios**: iOS unit tests
- **test-integration**: Cross-component integration tests
- **test-e2e-web**: End-to-end tests on Chromium and Firefox

#### Security
- **security-audit**: npm audit for known vulnerabilities

#### Final Check
- **ci-success**: Aggregates results and fails build if critical jobs fail

**Critical Jobs** (must pass):
- TypeScript linting
- Core build
- Web build
- Core tests

**Non-Critical Jobs** (warnings only):
- Android/iOS builds and tests (may not be fully configured)
- Integration tests
- E2E tests

### 2. Release Workflow (`release.yml`)

**Triggers:**
- Git tags matching `v*.*.*` (production releases)
- Git tags matching `v*.*.*-beta.*` or `v*.*.*-alpha.*` (pre-releases)
- Manual workflow dispatch with version input

**Jobs:**

1. **prepare-release**: Determines version and release type
2. **build-all**: Builds all platforms with updated version numbers
3. **build-android**: Creates release APK (unsigned)
4. **build-ios**: Creates iOS build info
5. **test-release**: Runs tests on release builds
6. **create-release**: Creates GitHub release with artifacts
7. **notify-completion**: Reports success/failure

**Artifacts:**
- Web application tarball (`web-{version}.tar.gz`)
- Android APK (`sovereign-communications-{version}.apk`)
- iOS build information

**Release Process:**

```bash
# Create a beta release
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1

# Create a production release
git tag v1.0.0
git push origin v1.0.0

# Or use workflow dispatch for custom versions
```

### 3. Deploy Workflow (`deploy.yml`)

**Triggers:**
- Push to `main` (staging deployment)
- Git tags starting with `v` (production deployment)
- Manual workflow dispatch

**Environments:**
- **Staging**: Deployed on every push to main
- **Production**: Deployed on version tags

**Features:**
- Canary deployments (10% traffic initially)
- Health checks before full rollout
- Automatic rollback on failure

### 4. E2E Test Workflow (`e2e.yml`)

**Triggers:**
- Push to `main` or `develop`
- Pull requests
- Nightly schedule (2 AM UTC)
- Manual workflow dispatch

**Test Types:**
- Web E2E tests (Chromium, Firefox, WebKit)
- Cross-platform web-to-web tests
- Android E2E tests (scheduled/manual only)
- iOS E2E tests (scheduled/manual only)
- Visual regression tests
- Performance tests

## Best Practices

### For Contributors

1. **Run tests locally before pushing:**
   ```bash
   npm run lint
   npm test
   npm run build
   ```

2. **Use descriptive commit messages:**
   ```
   feat(web): add message search functionality
   fix(android): resolve crash on network disconnect
   docs(core): update API documentation
   ```

3. **Keep PRs focused:** One feature or fix per PR

4. **Wait for CI checks:** Ensure all checks pass before merging

### For Maintainers

1. **Semantic Versioning:**
   - MAJOR: Breaking changes
   - MINOR: New features (backwards compatible)
   - PATCH: Bug fixes

2. **Release Checklist:**
   - [ ] All CI checks passing
   - [ ] Version numbers updated
   - [ ] Changelog updated
   - [ ] Release notes prepared
   - [ ] Tag created and pushed

3. **Monitoring:**
   - Check workflow runs regularly
   - Review security audit results
   - Monitor build times and optimize as needed

## Troubleshooting

### Build Failures

**TypeScript Errors:**
```bash
cd core && npm run build
# Fix any type errors
```

**Test Failures:**
```bash
npm test -w core -- --verbose
# Check test output for specific failures
```

**Android Build Issues:**
- Ensure Gradle 8.5+ is being used
- Check Java version (requires JDK 17)
- Verify Android SDK is properly configured

**iOS Build Issues:**
- Ensure Xcode version is compatible
- Check for missing Swift packages
- Verify provisioning profiles (for release builds)

### Workflow Issues

**Workflow Not Triggering:**
- Check trigger conditions in workflow file
- Verify branch name matches trigger pattern
- Check GitHub Actions permissions

**Artifact Upload Failures:**
- Ensure artifact paths exist
- Check artifact size limits (GitHub has 2GB limit per artifact)
- Verify workflow has correct permissions

**Deployment Failures:**
- Check environment secrets are configured
- Verify deployment target is accessible
- Review deployment logs for specific errors

## Performance Optimization

### Current Performance Targets

- **Total CI time**: < 20 minutes for full pipeline
- **Core tests**: < 5 minutes
- **Build times**: < 3 minutes each
- **E2E tests**: < 10 minutes per browser

### Optimization Strategies

1. **Caching:**
   - npm dependencies cached
   - Gradle packages cached
   - Build artifacts shared between jobs

2. **Parallelization:**
   - Tests run in parallel across Node versions
   - E2E tests run in parallel across browsers
   - Platform builds run independently

3. **Conditional Execution:**
   - Mobile tests only run on schedule or manual trigger
   - Some jobs skip if not needed (path filters)

## Security

### Secret Management

Secrets are stored in GitHub repository settings:
- `GITHUB_TOKEN`: Automatically provided by GitHub
- `NPM_TOKEN`: For npm package publishing (if configured)
- Deployment credentials in environment-specific secrets

### Vulnerability Scanning

- **npm audit**: Checks for known vulnerabilities in dependencies
- **audit-ci**: Fails build on moderate+ severity vulnerabilities
- **CodeQL** (if enabled): Scans for code-level security issues

## Monitoring and Metrics

### Key Metrics

- Build success rate
- Test pass rate
- Average build time
- Deployment frequency
- Mean time to recovery (MTTR)

### Accessing Metrics

1. Go to repository **Actions** tab
2. Click on **Workflows** to see individual workflow history
3. Click on a specific workflow run for detailed logs
4. Check **Insights** → **Actions** for usage statistics

## Support

For CI/CD issues:
1. Check this documentation
2. Review workflow logs in GitHub Actions
3. Open an issue with the `ci/cd` label
4. Contact the dev team in discussions

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Project README](../README.md)
- [Contributing Guide](../CONTRIBUTING.md)
