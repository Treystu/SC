# CI/CD Pipeline Documentation

## Overview

The Sovereign Communications project uses GitHub Actions for continuous integration and deployment. The pipeline is designed to ensure code quality, security, and reliability through automated testing and deployment.

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Actions CI/CD                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Lint   │  │  Build   │  │Security  │  │ Coverage │   │
│  │  (5 min) │  │(10 min)  │  │(10 min)  │  │(15 min)  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Unit Tests (Parallel - 10 min)               │  │
│  ├────────┬────────┬────────┬────────┬────────┬────────┤  │
│  │ Crypto │Protocol│  Mesh  │Transport│Discovery│ Other │  │
│  └────────┴────────┴────────┴────────┴────────┴────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        Integration Tests (15 min)                     │  │
│  ├────────────────────────────────────────────────────┤  │
│  │  Cross-module │ Contract │ Database │ API Tests      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        E2E Tests (Parallel - 20 min)                  │  │
│  ├─────────────┬─────────────┬─────────────┬───────────┤  │
│  │  Chromium   │  Firefox    │   WebKit    │  Mobile   │  │
│  └─────────────┴─────────────┴─────────────┴───────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        Visual Regression (30 min)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        Performance Tests (15 min)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Workflows

### 1. Main CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**Jobs:**

#### Lint (5 minutes)
- **Purpose:** Catch code style and basic errors early
- **Steps:**
  1. Checkout code
  2. Setup Node.js with caching
  3. Install dependencies
  4. Run ESLint
- **Failure Impact:** Blocks all other jobs

#### Build (10 minutes)
- **Purpose:** Ensure code compiles successfully
- **Steps:**
  1. Checkout code
  2. Setup Node.js with caching
  3. Install dependencies
  4. Build core library (`npm run build -w core`)
  5. Build web application (`npm run build -w web`)
  6. Cache build artifacts
- **Artifacts:** Build outputs cached for other jobs
- **Failure Impact:** Blocks dependent jobs

#### Unit Tests (10 minutes, parallel)
- **Purpose:** Test individual modules in isolation
- **Strategy:** Matrix build across test groups
- **Matrix:**
  - `crypto` - Cryptography primitives
  - `protocol` - Message protocol
  - `mesh` - Mesh networking
  - `transport` - WebRTC transport
  - `discovery` - Peer discovery
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Run tests for specific module with coverage
  5. Upload coverage to Codecov
- **Coverage:** Per-module coverage reports
- **Failure Impact:** Does not block other test groups (fail-fast disabled)

#### Integration Tests (15 minutes)
- **Purpose:** Test module interactions and contracts
- **Dependencies:** Build job
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Restore build cache
  5. Run integration tests
- **Coverage:** Cross-module integration
- **Failure Impact:** Blocks deployment

#### E2E Tests (20 minutes, parallel)
- **Purpose:** Test complete user workflows
- **Strategy:** Matrix build across browsers
- **Matrix:**
  - `chromium` - Chrome/Edge
  - `firefox` - Firefox
  - `webkit` - Safari
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Install Playwright browser
  5. Restore build cache
  6. Run E2E tests for browser
  7. Upload test results and screenshots
- **Artifacts:** Test reports, screenshots, videos
- **Retry:** Up to 2 retries on failure
- **Failure Impact:** Does not block other browsers

#### Coverage (15 minutes)
- **Purpose:** Generate complete coverage report
- **Dependencies:** Unit tests
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Run all tests with coverage
  5. Generate HTML and LCOV reports
  6. Upload to Codecov
  7. Comment on PR with coverage delta
- **Thresholds:**
  - Branches: 80%
  - Functions: 80%
  - Lines: 80%
  - Statements: 80%
- **Failure Impact:** Informational, does not block

#### Security (10 minutes)
- **Purpose:** Scan for vulnerabilities
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Run npm audit
  5. Initialize CodeQL
  6. Perform CodeQL analysis
- **Tools:**
  - npm audit (dependency vulnerabilities)
  - CodeQL (code vulnerabilities)
- **Failure Impact:** Blocks deployment on critical issues

#### Performance (15 minutes)
- **Purpose:** Run performance benchmarks
- **Dependencies:** Build job
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Run crypto benchmarks with GC
  5. Upload results
- **Metrics Tracked:**
  - Operation latency
  - Throughput
  - Memory usage
- **Artifacts:** Benchmark results JSON
- **Failure Impact:** Informational

### 2. Visual Regression Workflow (`.github/workflows/visual-regression.yml`)

**Triggers:**
- Pull requests to `main` or `develop`
- Push to `main` (for baseline updates)

**Jobs:**

#### Visual Tests (30 minutes)
- **Purpose:** Detect UI regressions
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Install Playwright with Chromium
  5. Build application
  6. Run visual regression tests
  7. Upload screenshots and diffs
  8. Comment on PR with results
- **Comparison:** Against baseline screenshots
- **Threshold:** Configurable pixel difference
- **Failure Impact:** Requires manual review

#### Update Baselines (main branch only)
- **Purpose:** Update baseline screenshots
- **Trigger:** Push to `main`
- **Steps:**
  1. Checkout code
  2. Setup Node.js
  3. Install dependencies
  4. Build application
  5. Update baseline screenshots
  6. Commit and push changes
- **Auto-commit:** Yes, with `[skip ci]`

## Performance Optimizations

### 1. Dependency Caching
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
```
- Caches `node_modules` based on `package-lock.json`
- Reduces install time from ~60s to ~10s

### 2. Build Artifact Caching
```yaml
- uses: actions/cache@v3
  with:
    path: |
      core/dist
      web/dist
    key: build-${{ github.sha }}
```
- Shares build outputs between jobs
- Eliminates redundant builds

### 3. Parallel Execution
- Unit tests run in parallel matrix
- E2E tests run in parallel across browsers
- Reduces total pipeline time by ~60%

### 4. Conditional Jobs
- Visual regression only on PRs
- Baseline updates only on `main`
- Performance tests optional on draft PRs

## Pipeline Metrics

### Target Times
- **Full Pipeline:** <15 minutes
- **Unit Tests:** <10 minutes
- **E2E Tests:** <20 minutes
- **Lint + Build:** <15 minutes

### Current Performance
- **Average:** ~14 minutes
- **Best Case:** ~12 minutes (cached)
- **Worst Case:** ~18 minutes (cold cache)

### Success Rates
- **Overall:** >95%
- **Unit Tests:** >98%
- **E2E Tests:** >90% (with retries)
- **Visual:** >85% (requires manual review)

## Failure Handling

### Automatic Retries
```yaml
retries: process.env.CI ? 2 : 0
```
- E2E tests retry up to 2 times
- Handles flaky network/timing issues

### Failure Notifications
- PR comments on failures
- Status checks block merge
- Artifacts uploaded for debugging

### Debug Information
- Full test logs
- Screenshots on failure
- Video recordings (E2E)
- Coverage reports
- Performance metrics

## Environment Variables

### Required Secrets
```yaml
GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
- Auto-provided by GitHub
- Used for PR comments and status checks

### Optional Secrets
```yaml
CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
```
- For private repos
- Public repos work without token

### Environment Variables
```yaml
CI: true
NODE_ENV: test
```
- `CI=true` enables CI-specific behavior
- `NODE_ENV=test` for test configuration

## Status Badges

Add to README.md:

```markdown
[![CI](https://github.com/Treystu/SC/workflows/CI/badge.svg)](https://github.com/Treystu/SC/actions?query=workflow%3ACI)
[![Coverage](https://codecov.io/gh/Treystu/SC/branch/main/graph/badge.svg)](https://codecov.io/gh/Treystu/SC)
[![Visual Tests](https://github.com/Treystu/SC/workflows/Visual%20Regression%20Testing/badge.svg)](https://github.com/Treystu/SC/actions?query=workflow%3A%22Visual+Regression+Testing%22)
```

## Deployment Pipeline (Future)

### Staging Deployment
```yaml
deploy-staging:
  needs: [ci-success]
  if: github.ref == 'refs/heads/develop'
  steps:
    - Deploy to staging environment
    - Run smoke tests
    - Notify team
```

### Production Deployment
```yaml
deploy-production:
  needs: [ci-success]
  if: github.ref == 'refs/heads/main'
  steps:
    - Create release
    - Deploy to production
    - Run health checks
    - Rollback on failure
```

### Canary Deployment
```yaml
canary-deploy:
  steps:
    - Deploy to 10% of users
    - Monitor metrics for 1 hour
    - Gradually increase to 100%
    - Rollback if errors detected
```

## Monitoring and Alerts

### Metrics Tracked
- Pipeline duration
- Test pass rate
- Flaky test detection
- Coverage trends
- Performance regressions

### Alerts
- Slack/Email on pipeline failure
- Coverage drops below threshold
- Performance regressions detected
- Security vulnerabilities found

## Best Practices

1. **Keep pipelines fast** - Target <15 minutes
2. **Use parallel jobs** - Maximize concurrency
3. **Cache aggressively** - Dependencies, builds, test results
4. **Fail fast** - Run quick checks first
5. **Provide debug info** - Logs, screenshots, artifacts
6. **Monitor trends** - Track metrics over time
7. **Regular maintenance** - Update actions, dependencies
8. **Test locally** - Use act or similar tools

## Troubleshooting

### Pipeline Timeout
- Increase timeout: `timeout-minutes: 30`
- Split into smaller jobs
- Optimize slow tests

### Flaky Tests
- Use retries for E2E tests
- Increase timeouts where needed
- Add proper waits
- Mock unstable dependencies

### Cache Issues
- Update cache key
- Clear cache via UI
- Verify cache paths

### Resource Limits
- Use `maxWorkers: 2` in CI
- Limit parallel jobs
- Split large test suites

## Local Development

### Run CI Locally
```bash
# Install act
brew install act  # macOS

# Run CI workflow
act -j lint
act -j build
act -j test-unit
```

### Test Coverage Locally
```bash
npm run test:coverage
open core/coverage/index.html
```

### Visual Tests Locally
```bash
npm run test:e2e:ui
```

## Contributing

When adding new jobs:
1. Keep them fast (<15 min)
2. Use appropriate timeouts
3. Upload relevant artifacts
4. Add to CI success check
5. Document in this file

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
- [Jest CI Configuration](https://jestjs.io/docs/configuration#ci-boolean)
- [Codecov Documentation](https://docs.codecov.com/)
