# Testing Strategy Documentation

## Overview

This document outlines the comprehensive testing strategy for Sovereign Communications, covering unit tests, integration tests, E2E tests, and CI/CD automation.

## Testing Pyramid

```
        /\
       /E2E\          - End-to-end tests (Playwright)
      /------\        - Cross-browser, user flows
     /        \
    /Integration\     - Module integration tests
   /------------\     - Contract tests
  /              \
 /   Unit Tests   \   - Component tests (Jest)
/------------------\  - Property-based tests (fast-check)
                      - Performance tests
```

## Test Categories

### 1. Unit Tests (Jest)

**Location:** `core/src/**/*.test.ts`

**Coverage Target:** 95%+

**Test Types:**
- **Standard Unit Tests:** Test individual functions and classes
- **Property-Based Tests:** Use fast-check to verify properties hold for all inputs
- **Performance Tests:** Ensure operations meet performance thresholds

**Running Unit Tests:**
```bash
# Run all unit tests
npm run test:unit

# Run with coverage
npm run test:coverage

# Run specific test file
cd core && npm test -- primitives.test.ts

# Run in watch mode
cd core && npm test -- --watch
```

**Best Practices:**
- Each module should have corresponding test file
- Use descriptive test names: `should [behavior] when [condition]`
- Test happy paths, edge cases, and error conditions
- Mock external dependencies
- Use `beforeEach` for test setup
- Clean up after tests in `afterEach`

### 2. Integration Tests

**Location:** `tests/*.test.ts`

**Purpose:** Test interactions between modules

**Test Types:**
- **Contract Tests:** Verify module interfaces and data contracts
- **Cross-Module Tests:** Test module interactions
- **Database Integration:** Test persistence layers
- **API Integration:** Test network communication

**Running Integration Tests:**
```bash
npm run test:integration
```

**Best Practices:**
- Test realistic scenarios
- Verify data flows between components
- Test error propagation
- Validate state transitions
- Test concurrency issues

### 3. E2E Tests (Playwright)

**Location:** `tests/*.e2e.test.ts`

**Coverage:** Complete user workflows

**Test Types:**
- **User Authentication:** Identity generation, persistence
- **Peer Discovery:** QR codes, manual entry, peer connections
- **Messaging:** Send/receive, offline queuing, persistence
- **File Transfer:** Upload, download, progress tracking
- **Performance:** Load times, UI responsiveness
- **Security:** Encryption verification, key management
- **Accessibility:** Keyboard navigation, screen reader support

**Running E2E Tests:**
```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode (interactive)
npm run test:e2e:ui

# Run specific browser
npx playwright test --project=chromium

# Run specific test file
npx playwright test app.e2e.test.ts

# Debug mode
npx playwright test --debug
```

**Cross-Browser Testing:**
- Chromium (Chrome, Edge)
- Firefox
- WebKit (Safari)
- Mobile Chrome (Android)
- Mobile Safari (iOS)

**Best Practices:**
- Use data-testid attributes for selectors
- Test real user flows
- Handle async operations properly
- Take screenshots on failure
- Use page object pattern for complex pages
- Test responsive layouts

### 4. Mutation Testing (Stryker)

**Purpose:** Verify test quality by introducing mutations

**Running Mutation Tests:**
```bash
npm run test:mutation
```

**Configuration:** `stryker.config.js`

**Thresholds:**
- High: 80%
- Low: 60%
- Break: 50%

**Best Practices:**
- Run on modified code sections
- Use incremental mode for efficiency
- Focus on critical paths first
- Review surviving mutants

### 5. Performance Tests

**Location:** `core/src/crypto/performance.test.ts`

**Metrics Tracked:**
- Operation latency
- Throughput (ops/sec)
- Memory usage
- Load handling

**Thresholds:**
- Key generation: <10ms
- Signing: <5ms
- Verification: <5ms
- Encryption: <10ms
- Decryption: <10ms
- Bulk operations: <500ms for 1MB

**Running Performance Tests:**
```bash
npm run test:perf
```

**Best Practices:**
- Warm up before measuring
- Run multiple iterations
- Report average and max times
- Test memory leaks with --expose-gc
- Compare against baselines

## CI/CD Pipeline

### Workflow: `.github/workflows/ci.yml`

**Trigger:** Push to main/develop, Pull requests

**Jobs:**

1. **Lint** (5 min)
   - ESLint checks
   - Code style validation

2. **Build** (10 min)
   - Core library compilation
   - Web application build
   - Artifact caching

3. **Unit Tests** (10 min, parallel)
   - Run by module (crypto, protocol, mesh, transport, discovery)
   - Coverage reports uploaded to Codecov
   - Fail fast disabled for comprehensive results

4. **Integration Tests** (15 min)
   - Cross-module integration
   - Contract validation

5. **E2E Tests** (20 min, parallel)
   - Multi-browser testing
   - Visual regression
   - Performance monitoring

6. **Coverage** (15 min)
   - Full coverage report
   - PR comments with coverage delta
   - Codecov integration

7. **Security** (10 min)
   - npm audit
   - CodeQL analysis
   - Dependency scanning

8. **Performance** (15 min)
   - Benchmark execution
   - Results uploaded for trending

**Total Pipeline Time:** ~15 minutes (with parallelization)

### Pipeline Optimization

**Strategies:**
- Parallel job execution
- Build artifact caching
- Test result caching
- Dependency caching
- Matrix builds for E2E

**Performance Targets:**
- Full pipeline: <15 min
- Unit tests: <10 min
- E2E tests: <20 min
- Build: <10 min

## Coverage Requirements

### Minimum Coverage Thresholds

```javascript
{
  global: {
    branches: 80%,
    functions: 80%,
    lines: 80%,
    statements: 80%
  }
}
```

### Target Coverage

- **Overall:** 95%+
- **Critical Paths:** 100%
- **Crypto Module:** 100%
- **Protocol Module:** 100%
- **Mesh Module:** 95%+
- **Transport Module:** 90%+

### Uncovered Code

Acceptable reasons for uncovered code:
- Platform-specific code paths
- Error handlers for impossible states
- Debug/development utilities
- Generated code

Document uncovered code with comments:
```typescript
/* istanbul ignore next */
if (process.env.NODE_ENV === 'development') {
  // Development-only code
}
```

## Test Flakiness

### Detection

- Track test failures over time
- Mark flaky tests with `test.failing()` or `test.skip()`
- Use CI retry mechanism (max 2 retries)

### Prevention

- Avoid time-dependent assertions
- Use proper async/await
- Mock unstable dependencies
- Set appropriate timeouts
- Clean up after tests
- Avoid shared state

### Target

- Flakiness rate: <1%
- No permanently flaky tests in CI

## Continuous Monitoring

### Metrics Tracked

1. **Coverage Trends**
   - Overall coverage %
   - Per-module coverage
   - Coverage delta per PR

2. **Test Performance**
   - Test execution time
   - Slowest tests
   - Flaky test rate

3. **Build Performance**
   - Pipeline duration
   - Job durations
   - Cache hit rates

4. **Code Quality**
   - Mutation score
   - Security vulnerabilities
   - Code complexity

### Reporting

- Coverage badges in README
- Weekly test reports
- Performance regression alerts
- Security vulnerability notifications

## Writing New Tests

### Checklist for New Features

- [ ] Unit tests for all new functions
- [ ] Integration tests for module interactions
- [ ] E2E tests for user-facing features
- [ ] Property-based tests for algorithms
- [ ] Performance tests for critical paths
- [ ] Contract tests for public APIs
- [ ] Security tests for sensitive operations
- [ ] Documentation updated

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Happy Path', () => {
    it('should perform expected behavior', () => {
      // Arrange
      const input = setupInput();
      
      // Act
      const result = performAction(input);
      
      // Assert
      expect(result).toBe(expectedValue);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      expect(() => performAction(null)).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw on invalid input', () => {
      expect(() => performAction(invalidInput)).toThrow(ErrorType);
    });
  });
});
```

## Debugging Tests

### Jest Debugging

```bash
# Run single test
npm test -- -t "test name"

# Run with verbose output
npm test -- --verbose

# Run in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

### Playwright Debugging

```bash
# UI mode
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Headed mode
npx playwright test --headed

# Show browser
PWDEBUG=1 npx playwright test
```

### Coverage Debugging

```bash
# Generate HTML coverage report
npm test -- --coverage --coverageReporters=html

# Open in browser
open core/coverage/index.html
```

## Best Practices Summary

1. **Write tests first** (TDD when appropriate)
2. **Test behavior, not implementation**
3. **Keep tests simple and focused**
4. **Use descriptive test names**
5. **Test edge cases and errors**
6. **Avoid test interdependencies**
7. **Clean up after tests**
8. **Mock external dependencies**
9. **Test async code properly**
10. **Maintain high coverage**
11. **Review test quality regularly**
12. **Update tests with code changes**

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [fast-check Documentation](https://fast-check.dev/)
- [Stryker Documentation](https://stryker-mutator.io/)
- [Testing Best Practices](https://testingjavascript.com/)

## Support

For questions or issues with testing:
1. Check this documentation
2. Review existing tests for examples
3. Consult team members
4. Open issue with `testing` label
