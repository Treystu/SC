# Testing Infrastructure - Quick Start Guide

## Overview

Sovereign Communications now has comprehensive testing infrastructure covering unit tests, integration tests, E2E tests, visual regression, property-based testing, mutation testing, and performance benchmarks.

## Running Tests

### Unit Tests
```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- rate-limiter.test.ts

# Watch mode
npm test -- --watch
```

### Integration Tests
```bash
# Run all integration tests
npm run test:integration

# Run with coverage
npm run test:integration -- --coverage
```

### E2E Tests
```bash
# Run all E2E tests
npm run test:e2e

# Run specific browser
npm run test:e2e -- --project=chromium

# Run in UI mode (interactive)
npm run test:e2e:ui

# Run visual regression tests
npm run test:visual

# Cross-platform tests
npm run test:e2e:cross-platform     # Web-to-Web tests
npm run test:e2e:android            # Web-to-Android (requires Appium + emulator)
npm run test:e2e:ios                # Web-to-iOS (requires Appium + simulator)
npm run test:e2e:mobile             # All mobile tests
```

### Performance Tests
```bash
# Run performance benchmarks
npm run test:performance
```

### Mutation Testing
```bash
# Run mutation tests (takes time!)
npm run test:mutation
```

## Test Organization

```
SC/
├── core/src/
│   ├── **/*.test.ts          # Unit tests (co-located with source)
│   └── crypto/
│       └── property-based.test.ts  # Property-based tests
├── tests/
│   ├── integration/           # Integration tests
│   │   ├── setup.ts
│   │   ├── teardown.ts
│   │   └── *.integration.test.ts
│   ├── e2e/                   # E2E tests
│   │   ├── app-basics.e2e.test.ts
│   │   ├── messaging.e2e.test.ts
│   │   ├── visual.visual.test.ts
│   │   ├── cross-platform/    # Cross-platform tests
│   │   │   ├── web-to-web.e2e.test.ts
│   │   │   └── multi-platform.e2e.test.ts
│   │   └── mobile/            # Mobile integration tests
│   │       ├── android/
│   │       │   └── web-to-android.e2e.test.ts
│   │       └── ios/
│   │           └── web-to-ios.e2e.test.ts
│   ├── performance/           # Performance benchmarks
│   │   └── *-benchmarks.ts
│   ├── cross-platform-framework.ts  # Cross-platform test framework
│   ├── e2e-framework.ts       # Web E2E framework
│   └── scripts/
│       └── coverage-gaps.js   # Coverage analysis tool
├── appium.config.ts           # Appium configuration for mobile
└── docs/E2E_TESTING.md        # Detailed E2E testing guide
```

## Writing Tests

### Unit Test Example
```typescript
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('should allow consumption within capacity', () => {
    const limiter = new RateLimiter({
      capacity: 10,
      refillRate: 1,
    });

    expect(limiter.tryConsume(5)).toBe(true);
  });
});
```

### Integration Test Example
```typescript
// tests/integration/crypto-protocol.integration.test.ts
describe('Crypto-Protocol Integration', () => {
  it('should sign and verify a complete message', async () => {
    const identity = await generateIdentity();
    const message = createMessage(identity);
    const encoded = encodeMessage(message);
    const decoded = decodeMessage(encoded);
    
    expect(decoded).toEqual(message);
  });
});
```

### E2E Test Example
```typescript
// tests/e2e/messaging.e2e.test.ts
import { test, expect } from '@playwright/test';

test('should send a text message', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid="message-input"]', 'Hello!');
  await page.click('[data-testid="send-btn"]');
  
  await expect(page.locator('text=Hello!')).toBeVisible();
});
```

### Cross-Platform Test Example
```typescript
// tests/e2e/cross-platform/web-to-web.e2e.test.ts
import { test, expect } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient } from '../../cross-platform-framework';

test('should send message between clients', async ({ browser, page }) => {
  const coordinator = new CrossPlatformTestCoordinator();
  
  // Create clients
  const client1 = await coordinator.createClient(
    { platform: 'web', name: 'alice' },
    page,
    browser
  ) as WebClient;
  
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  const client2 = await coordinator.createClient(
    { platform: 'web', name: 'bob' },
    page2,
    browser
  ) as WebClient;
  
  // Connect and test
  await coordinator.connectClients(client1, client2);
  const received = await coordinator.sendAndVerifyMessage(
    client1,
    client2,
    'Hello!',
    10000
  );
  
  expect(received).toBe(true);
  await coordinator.cleanup();
});
```

### Property-Based Test Example
```typescript
import fc from 'fast-check';

it('should verify any signed message', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uint8Array({ minLength: 1, maxLength: 1000 }),
      async (data) => {
        const identity = await generateIdentity();
        const signature = await signMessage(data, identity.privateKey);
        const isValid = await verifySignature(data, signature, identity.publicKey);
        
        expect(isValid).toBe(true);
      }
    ),
    { numRuns: 50 }
  );
});
```

## Coverage Analysis

```bash
# Analyze coverage gaps
node tests/scripts/coverage-gaps.js

# Generate coverage report
npm run test:coverage
```

View coverage report in `core/coverage/lcov-report/index.html`

## CI/CD Workflows

### CI Pipeline (.github/workflows/ci.yml)
- Runs on: Push to main/develop/copilot branches, PRs
- Jobs: Lint → Test → Build → Integration Tests → Security
- Matrix: Node 18, 20, 22
- Timeout: 15 minutes

### E2E Pipeline (.github/workflows/e2e.yml)
- Runs on: Push to main/develop, PRs, nightly schedule
- Jobs: 
  - **Web E2E**: Basic web tests (chromium, firefox, webkit)
  - **Cross-Platform Web**: Web-to-Web messaging tests
  - **Android E2E**: Web-to-Android tests (nightly or manual)
  - **iOS E2E**: Web-to-iOS tests (nightly or manual, macOS runner)
- Screenshots/videos on failure
- Timeout: 20-60 minutes (depending on platform)

### Deployment Pipeline (.github/workflows/deploy.yml)
- Runs on: Push to main (staging), version tags (production)
- Features: Canary deployments, health monitoring, rollback
- Timeout: 20 minutes

## Test Configuration Files

- **core/jest.config.cjs** - Unit test configuration
- **jest.integration.config.js** - Integration test configuration
- **playwright.config.ts** - E2E test configuration
- **playwright.visual.config.ts** - Visual regression configuration
- **stryker.conf.js** - Mutation testing configuration

## Best Practices

1. **Test Naming**: Use descriptive names that explain behavior
   - Good: `should allow consumption within capacity`
   - Bad: `test1`

2. **AAA Pattern**: Arrange, Act, Assert
   ```typescript
   it('should...', () => {
     // Arrange
     const limiter = new RateLimiter({ capacity: 10, refillRate: 1 });
     
     // Act
     const result = limiter.tryConsume(5);
     
     // Assert
     expect(result).toBe(true);
   });
   ```

3. **Isolation**: Each test should be independent
   - Use `beforeEach`/`afterEach` for setup/cleanup
   - Don't share state between tests

4. **Mock External Dependencies**: Use Jest mocks
   ```typescript
   jest.mock('./external-service');
   ```

5. **Test Edge Cases**: Include boundary conditions
   - Empty inputs
   - Maximum values
   - Error conditions

## Debugging Tests

### Jest Debugger
```bash
# Run with Node debugger
node --inspect-brk node_modules/.bin/jest --runInBand

# VS Code launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal"
}
```

### Playwright Debugger
```bash
# Run in debug mode
npm run test:e2e -- --debug

# Use UI mode
npm run test:e2e:ui
```

## Coverage Targets

- **Overall**: 95%+
- **Critical paths** (crypto, security): 100%
- **New code**: 100%
- **Files**: 80%+ (currently 23%)

## Test Performance

- **Unit tests**: <10 seconds
- **Integration tests**: <30 seconds
- **E2E tests**: <5 minutes
- **Full CI pipeline**: <15 minutes

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
npm run build -w core
```

### "Test timeout" errors
```typescript
// Increase timeout for specific test
it('slow test', async () => {
  // ...
}, 30000); // 30 second timeout
```

### Flaky tests
- Check for timing issues (use `waitFor` instead of `setTimeout`)
- Ensure proper cleanup in `afterEach`
- Check for shared state between tests

## Resources

- **Full Documentation**: [docs/TESTING.md](../docs/TESTING.md)
- **E2E Testing Guide**: [docs/E2E_TESTING.md](../docs/E2E_TESTING.md)
- **Jest Docs**: https://jestjs.io/
- **Playwright Docs**: https://playwright.dev/
- **Appium Docs**: https://appium.io/docs/en/latest/
- **fast-check Docs**: https://github.com/dubzzz/fast-check

## Getting Help

1. Check existing tests for examples
2. Review test documentation
3. Run coverage analysis to identify gaps
4. Ask in team chat or open an issue

---

**Quick Reference:**
- Unit tests: `npm test`
- Coverage: `npm run test:coverage`
- E2E tests: `npm run test:e2e`
- Cross-platform: `npm run test:e2e:cross-platform`
- Integration: `npm run test:integration`
- Performance: `npm run test:performance`
- Coverage gaps: `node tests/scripts/coverage-gaps.js`
- Mobile tests: `npm run test:e2e:mobile` (requires Appium setup)
