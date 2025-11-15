# Tests Directory

This directory contains integration tests, E2E tests, and cross-module test suites for Sovereign Communications.

## Directory Structure

```
tests/
├── app.e2e.test.ts              # End-to-end application tests
├── visual-regression.test.ts    # Visual regression tests
├── contracts.test.ts            # Contract tests between modules
├── e2e-framework.ts             # E2E test framework and helpers
├── ble-mesh.test.ts            # Bluetooth mesh integration tests
├── crypto.test.ts              # Crypto integration tests
├── file-transfer.test.ts       # File transfer integration tests
├── mesh-network.test.ts        # Mesh network integration tests
├── peer-discovery.test.ts      # Peer discovery integration tests
├── webrtc-integration.test.ts  # WebRTC integration tests
└── visual-baselines/           # Baseline screenshots for visual tests
```

## Test Types

### Integration Tests

Integration tests verify that modules work correctly together. These tests are located in `tests/*.test.ts` files (excluding E2E tests).

**Examples:**
- `crypto.test.ts` - Tests crypto module integration
- `mesh-network.test.ts` - Tests mesh networking components together
- `webrtc-integration.test.ts` - Tests WebRTC with mesh networking

**Running integration tests:**
```bash
npm run test:integration
```

### E2E Tests

E2E (End-to-End) tests verify complete user workflows across the application using Playwright.

**Test Files:**
- `app.e2e.test.ts` - Main application user flows
- `visual-regression.test.ts` - Visual regression testing

**Running E2E tests:**
```bash
# All E2E tests
npm run test:e2e

# Specific browser
npx playwright test --project=chromium

# UI mode (interactive)
npm run test:e2e:ui

# Debug mode
npx playwright test --debug
```

### Contract Tests

Contract tests ensure that module interfaces remain stable and compatible.

**Test File:**
- `contracts.test.ts` - Interface and data contract tests

**Running contract tests:**
```bash
npm test tests/contracts.test.ts
```

### Visual Regression Tests

Visual tests detect unintended UI changes by comparing screenshots.

**Test File:**
- `visual-regression.test.ts` - Component and page screenshot tests

**Running visual tests:**
```bash
npx playwright test --project=visual
```

**Updating baselines:**
```bash
npx playwright test --project=visual --update-snapshots
```

## Test Framework (e2e-framework.ts)

The E2E test framework provides helper methods for common testing scenarios:

```typescript
import { E2ETestFramework } from './e2e-framework';

test('example test', async ({ page }) => {
  const framework = new E2ETestFramework(page);
  
  await framework.navigateToApp();
  await framework.createNewContact('Alice', publicKey);
  await framework.sendMessage('Alice', 'Hello!');
  await framework.waitForMessageReceived('Hello!');
});
```

### Available Methods

**Navigation:**
- `navigateToApp()` - Navigate to application and wait for load
- `clearLocalStorage()` - Clear browser local storage
- `clearIndexedDB()` - Clear IndexedDB databases

**Contacts:**
- `createNewContact(name, publicKey)` - Add a new contact
- `getPeerCount()` - Get number of connected peers
- `waitForPeerConnection(count)` - Wait for peer connections

**Messaging:**
- `sendMessage(contactName, message)` - Send a text message
- `waitForMessageReceived(message)` - Wait for message to appear
- `getMessageCount()` - Get number of messages

**File Transfer:**
- `sendFile(contactName, filePath)` - Send a file
- `waitForFileTransferComplete(fileName)` - Wait for transfer completion

**Voice/Video:**
- `startVoiceCall(contactName)` - Initiate voice call
- `endVoiceCall()` - End active call

**Network:**
- `enableOfflineMode()` - Simulate offline state
- `disableOfflineMode()` - Restore online state
- `simulateSlowNetwork()` - Add network latency
- `simulateNetworkFailure()` - Block all network requests
- `restoreNetwork()` - Remove network simulation

**Performance:**
- `measurePerformance()` - Get page load metrics
- `takeScreenshot(name)` - Take and save screenshot

## Writing New Tests

### Integration Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Module Integration', () => {
  it('should integrate correctly', async () => {
    // Arrange
    const module1 = new Module1();
    const module2 = new Module2();
    
    // Act
    const result = await module1.interactWith(module2);
    
    // Assert
    expect(result).toBeDefined();
  });
});
```

### E2E Test Template

```typescript
import { test, expect } from '@playwright/test';
import { E2ETestFramework } from './e2e-framework';

test.describe('Feature Name', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should perform user action', async ({ page }) => {
    // Test steps
    await framework.createNewContact('TestUser', publicKey);
    
    // Assertions
    await expect(page.locator('[data-testid="contact-TestUser"]')).toBeVisible();
  });
});
```

### Visual Test Template

```typescript
import { test, expect } from '@playwright/test';

test('should match component screenshot @visual', async ({ page }) => {
  await page.goto('/component');
  await page.waitForLoadState('networkidle');
  
  await expect(page).toHaveScreenshot('component-name.png', {
    fullPage: true,
    animations: 'disabled',
  });
});
```

## Best Practices

### General
1. **Use descriptive test names** - Clearly state what is being tested
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **One assertion per test** - Keep tests focused
4. **Clean up after tests** - Use `afterEach` for cleanup
5. **Avoid test interdependence** - Each test should be independent

### E2E Tests
1. **Use data-testid attributes** - Don't rely on text or classes
2. **Wait for elements properly** - Use Playwright's auto-waiting
3. **Handle async operations** - Always await promises
4. **Take screenshots on failure** - Helps debugging
5. **Test happy paths first** - Then add edge cases

### Visual Tests
1. **Disable animations** - Ensures consistent screenshots
2. **Use fixed viewport** - Consistent screen size
3. **Mask dynamic content** - Hide timestamps, random IDs
4. **Update baselines carefully** - Review changes before committing
5. **Run on same OS in CI** - Prevents pixel differences

### Integration Tests
1. **Test real interactions** - Don't mock everything
2. **Verify data flows** - Check data passes correctly
3. **Test error propagation** - Ensure errors bubble up
4. **Use realistic data** - Test with actual use case data
5. **Performance matters** - Keep tests fast

## Debugging Tests

### E2E Tests

**Debug mode:**
```bash
npx playwright test --debug
```

**Headed mode:**
```bash
npx playwright test --headed
```

**Show trace viewer:**
```bash
npx playwright show-trace trace.zip
```

**Console logging:**
```typescript
test('debug test', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  // ... test steps
});
```

### Integration Tests

**Run single test:**
```bash
npm test -- -t "test name"
```

**Verbose output:**
```bash
npm test -- --verbose
```

**Debug in Node:**
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## CI/CD Integration

### Automated Testing

All tests run automatically on:
- Pull requests
- Pushes to `main` and `develop`
- Manual workflow dispatch

### Test Reports

Test results are published as:
- GitHub Actions checks
- PR comments with summary
- HTML reports (artifacts)
- Coverage reports (Codecov)

### Visual Regression

Visual tests run on every PR:
- Screenshots compared to baselines
- Differences highlighted
- Manual approval required for changes

## Troubleshooting

### Common Issues

**Flaky E2E tests:**
- Increase timeouts
- Add proper waits
- Mock unstable dependencies
- Use retries in CI

**Visual test failures:**
- Check OS differences (font rendering)
- Verify viewport size
- Disable animations
- Update baselines if intentional

**Slow tests:**
- Use `test.concurrent` for parallel tests
- Mock heavy operations
- Reduce test data size
- Optimize selectors

**Integration test failures:**
- Check module initialization
- Verify mock setup
- Review error messages
- Add debug logging

## Contributing

When adding new tests:

1. Choose appropriate test type (unit/integration/E2E)
2. Follow existing patterns and structure
3. Add to relevant test file or create new one
4. Update this README if adding new patterns
5. Ensure tests pass locally before PR
6. Check CI results

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [E2E Testing Guide](https://playwright.dev/docs/best-practices)
- [Visual Testing Guide](https://playwright.dev/docs/test-snapshots)
