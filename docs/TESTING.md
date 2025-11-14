# Testing Infrastructure Documentation

## Overview

This document describes the comprehensive testing infrastructure for Sovereign Communications, including unit tests, integration tests, E2E tests, and CI/CD pipelines.

## Test Categories

### 1. Unit Tests

Located in `core/src/**/*.test.ts`, unit tests cover individual functions and modules.

**Running unit tests:**
```bash
npm run test:unit
npm run test:coverage  # With coverage report
```

**Coverage targets:**
- Overall: 95%+
- Critical paths: 100%
- New code: 100%

**Key files:**
- `core/jest.config.cjs` - Jest configuration
- Property-based tests using `fast-check`

### 2. Integration Tests

Located in `tests/integration/`, integration tests verify component interactions.

**Running integration tests:**
```bash
npm run test:integration
```

**Test scenarios:**
- Crypto-Protocol integration
- Mesh network routing
- Database operations
- API contracts

**Configuration:**
- `jest.integration.config.js` - Integration test setup
- `tests/integration/setup.ts` - Global setup
- `tests/integration/teardown.ts` - Global cleanup

### 3. E2E Tests

Located in `tests/e2e/`, E2E tests use Playwright to test the full application.

**Running E2E tests:**
```bash
npm run test:e2e           # Run all E2E tests
npm run test:e2e:ui        # Run with UI mode
npm run test:visual        # Visual regression tests
```

**Test coverage:**
- Application load and initialization
- Identity management
- Peer discovery
- Messaging functionality
- Offline capabilities
- Performance metrics

**Configuration:**
- `playwright.config.ts` - Main Playwright config
- `playwright.visual.config.ts` - Visual regression config

### 4. Visual Regression Tests

Automated visual testing using Playwright's screenshot comparison.

**Features:**
- Component-level screenshots
- Full-page screenshots
- Mobile responsive testing
- Dark mode testing

**Baseline management:**
```bash
npm run test:visual -- --update-snapshots  # Update baselines
```

### 5. Property-Based Tests

Using `fast-check` for property-based testing of cryptographic operations.

**Location:** `core/src/crypto/property-based.test.ts`

**Properties tested:**
- Encryption/decryption symmetry
- Signature verification correctness
- Key exchange commutativity
- Identity uniqueness

### 6. Performance Tests

Benchmarks and regression tests for performance-critical operations.

**Running performance tests:**
```bash
npm run test:performance
```

**Benchmarks:**
- Crypto operations (signing, encryption, etc.)
- Message processing throughput
- Routing table operations
- Network latency

**Results:** Saved to `performance-results/`

### 7. Mutation Testing

Using Stryker for mutation testing to verify test quality.

**Running mutation tests:**
```bash
npm run test:mutation
```

**Configuration:** `stryker.conf.js`

**Thresholds:**
- High: 80%
- Low: 60%
- Break: 50%

## CI/CD Pipeline

### Workflows

#### 1. CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**
- Push to main, develop, or copilot/* branches
- Pull requests

**Jobs:**
- Lint (5 min timeout)
- Test Core (parallel on Node 18, 20, 22)
- Build (10 min timeout)
- Integration Tests (15 min timeout)
- Security Audit

**Features:**
- Parallel test execution
- Test result caching
- Coverage upload to Codecov
- Build artifact storage

#### 2. E2E Pipeline (`.github/workflows/e2e.yml`)

**Triggers:**
- Push to main/develop
- Pull requests
- Nightly schedule (2 AM UTC)

**Jobs:**
- E2E tests (Chromium, Firefox, WebKit)
- Visual regression tests
- Performance tests

**Features:**
- Cross-browser testing
- Screenshot capture on failure
- Performance result archiving

#### 3. Deployment Pipeline (`.github/workflows/deploy.yml`)

**Triggers:**
- Push to main (staging)
- Version tags (production)
- Manual dispatch

**Environments:**
- Staging: Automated deployment on main branch
- Production: Tag-based deployment with canary

**Features:**
- Canary deployments (10% traffic)
- Health monitoring
- Automatic rollback on failure
- GitHub release creation

## Test Organization

### File Naming Conventions

- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`
- Visual tests: `*.visual.test.ts`
- Performance tests: `*-benchmarks.ts`

### Directory Structure

```
SC/
├── core/src/
│   ├── crypto/
│   │   ├── primitives.ts
│   │   ├── primitives.test.ts
│   │   └── property-based.test.ts
│   └── ...
├── tests/
│   ├── integration/
│   │   ├── setup.ts
│   │   ├── teardown.ts
│   │   └── *.integration.test.ts
│   ├── e2e/
│   │   └── *.e2e.test.ts
│   └── performance/
│       ├── runner.js
│       └── *-benchmarks.ts
├── playwright.config.ts
├── jest.integration.config.js
└── stryker.conf.js
```

## Best Practices

### Writing Tests

1. **Follow AAA pattern:** Arrange, Act, Assert
2. **Use descriptive names:** Test names should describe behavior
3. **Keep tests isolated:** No dependencies between tests
4. **Mock external dependencies:** Use Jest mocks for external services
5. **Test edge cases:** Include boundary conditions and error cases

### Code Coverage

1. **Aim for 95%+ coverage** on all new code
2. **100% coverage** for critical paths (crypto, security)
3. **Exclude generated code** from coverage requirements
4. **Review uncovered lines** regularly

### Performance Testing

1. **Establish baselines:** Track performance over time
2. **Set thresholds:** Fail builds on regression
3. **Test realistic scenarios:** Use production-like data
4. **Monitor trends:** Watch for gradual degradation

### CI/CD

1. **Fast feedback:** Keep pipeline under 15 minutes
2. **Parallel execution:** Run tests in parallel when possible
3. **Cache dependencies:** Cache npm modules between runs
4. **Fail fast:** Stop on first critical failure
5. **Artifact retention:** Keep test results for debugging

## Debugging Failed Tests

### Local Debugging

```bash
# Run specific test
npm test -- path/to/test.test.ts

# Run in watch mode
npm test -- --watch

# Run with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Playwright UI mode
npm run test:e2e:ui
```

### CI Debugging

1. Check workflow logs in GitHub Actions
2. Download test artifacts (screenshots, videos)
3. Review coverage reports
4. Check performance regression results

## Continuous Improvement

### Regular Tasks

- [ ] Review and update test coverage weekly
- [ ] Run mutation tests monthly
- [ ] Update visual baselines after UI changes
- [ ] Review and optimize slow tests
- [ ] Update dependencies and test frameworks

### Metrics to Track

- Test coverage percentage
- Test execution time
- Flakiness rate (<1% target)
- Performance benchmarks
- Mutation score

## Tools and Libraries

- **Jest**: Unit and integration testing
- **Playwright**: E2E and visual testing
- **fast-check**: Property-based testing
- **Stryker**: Mutation testing
- **Codecov**: Coverage reporting
- **GitHub Actions**: CI/CD automation

## Support

For issues with tests:
1. Check test logs and error messages
2. Review this documentation
3. Check test-specific READMEs
4. Open an issue with reproduction steps
