# E2E Cross-Platform Testing Guide

## Overview

This guide covers end-to-end (E2E) cross-platform integration testing for Sovereign Communications across Web, Android, and iOS platforms.

## Test Structure

```
tests/
├── e2e/
│   ├── cross-platform/           # Cross-platform integration tests
│   │   ├── web-to-web.e2e.test.ts
│   │   └── multi-platform.e2e.test.ts
│   ├── mobile/
│   │   ├── android/
│   │   │   └── web-to-android.e2e.test.ts
│   │   └── ios/
│   │       └── web-to-ios.e2e.test.ts
│   ├── app-basics.e2e.test.ts    # Basic web app tests
│   └── messaging.e2e.test.ts     # Web messaging tests
├── cross-platform-framework.ts    # Cross-platform test framework
└── e2e-framework.ts              # Web E2E framework
```

## Prerequisites

### Web Testing
- Node.js 20+
- Playwright browsers installed: `npx playwright install`

### Android Testing
- Appium server installed: `npm install -g appium`
- UIAutomator2 driver: `appium driver install uiautomator2`
- Android SDK and emulator configured
- Android app built: `cd android && ./gradlew assembleDebug`

### iOS Testing
- Appium server installed: `npm install -g appium`
- XCUITest driver: `appium driver install xcuitest`
- Xcode installed (macOS only)
- iOS simulator configured
- iOS app built: `cd ios && xcodebuild -scheme SovereignCommunications -sdk iphonesimulator`

## Running Tests

### All E2E Tests
```bash
npm run test:e2e
```

### Web-Only Tests
```bash
npm run test:e2e -- tests/e2e/app-basics.e2e.test.ts
npm run test:e2e -- tests/e2e/messaging.e2e.test.ts
```

### Cross-Platform Tests
```bash
# Web-to-Web tests (no Appium needed)
npm run test:e2e:cross-platform

# Web-to-Android tests (requires Appium + Android emulator)
npm run test:e2e:android

# Web-to-iOS tests (requires Appium + iOS simulator on macOS)
npm run test:e2e:ios

# All mobile tests
npm run test:e2e:mobile
```

### Interactive Mode
```bash
npm run test:e2e:ui
```

## Setting Up Appium

### Install Appium
```bash
npm install -g appium
appium driver install uiautomator2
appium driver install xcuitest
```

### Start Appium Server
```bash
appium --port 4723
```

Or use the npm script:
```bash
npm run appium
```

### Check Appium Setup
```bash
npx appium-doctor --android  # For Android
npx appium-doctor --ios      # For iOS (macOS only)
```

## Setting Up Android Emulator

### Create Emulator
```bash
# List available system images
sdkmanager --list | grep system-images

# Install system image (Android 13)
sdkmanager "system-images;android-33;google_apis;x86_64"

# Create AVD
avdmanager create avd -n SC_Test -k "system-images;android-33;google_apis;x86_64"
```

### Start Emulator
```bash
emulator -avd SC_Test
```

### Build Android App
```bash
cd android
./gradlew assembleDebug
```

## Setting Up iOS Simulator (macOS Only)

### List Available Simulators
```bash
xcrun simctl list devices
```

### Create Simulator
```bash
xcrun simctl create "SC Test iPhone" "iPhone 15" "iOS17.0"
```

### Start Simulator
```bash
xcrun simctl boot "SC Test iPhone"
open -a Simulator
```

### Build iOS App
```bash
cd ios
xcodebuild -scheme SovereignCommunications \
  -sdk iphonesimulator \
  -configuration Debug \
  -derivedDataPath build
```

## Environment Variables

Configure tests using environment variables:

```bash
# Appium server
export APPIUM_HOST=localhost
export APPIUM_PORT=4723

# Android
export ANDROID_DEVICE_NAME="SC_Test"
export ANDROID_VERSION="13"
export ANDROID_APP_PATH="./android/app/build/outputs/apk/debug/app-debug.apk"

# iOS
export IOS_DEVICE_NAME="SC Test iPhone"
export IOS_VERSION="17.0"
export IOS_APP_PATH="./ios/build/Build/Products/Debug-iphonesimulator/SovereignCommunications.app"

# Web
export BASE_URL="http://localhost:5173"
```

## Test Scenarios

### Web-to-Web
- Basic messaging between two web clients
- Bidirectional messaging
- Message history persistence
- Offline/online transitions
- Special characters and emoji support
- Long messages
- Rapid messaging

### Web-to-Android
- Cross-platform messaging (web → Android)
- Cross-platform messaging (Android → web)
- Bidirectional messaging
- Message history across platforms
- Network interruption handling

### Web-to-iOS
- Cross-platform messaging (web → iOS)
- Cross-platform messaging (iOS → web)
- Bidirectional messaging
- Message history across platforms
- Rich text and emoji support

### Multi-Platform Mesh
- 4-node mesh network (2 web + Android + iOS)
- Broadcast messaging to all platforms
- Group conversations
- Partial network failure recovery
- Consistent state across platforms
- Rapid cross-platform messaging

## Debugging Tests

### Enable Verbose Logging
```bash
export LOG_LEVEL=debug
npm run test:e2e
```

### View Screenshots
Failed tests automatically capture screenshots in the `screenshots/` directory.

### View Test Reports
```bash
npx playwright show-report
```

### Inspect Test in UI Mode
```bash
npm run test:e2e:ui
```

## CI/CD Integration

Tests are automatically run in GitHub Actions:

- **Web E2E**: Runs on every push/PR
- **Cross-Platform**: Runs nightly (requires emulators/simulators)
- **Mobile**: Optional workflow (requires self-hosted runners with mobile setup)

## Troubleshooting

### Appium Connection Failed
- Ensure Appium server is running: `appium --port 4723`
- Check firewall settings
- Verify host/port in `appium.config.ts`

### Android Emulator Not Found
- Check emulator is running: `adb devices`
- Verify device name matches: `adb devices -l`
- Try restarting emulator

### iOS Simulator Not Found
- Check simulator is booted: `xcrun simctl list devices | grep Booted`
- Verify Xcode is installed: `xcodebuild -version`
- Ensure XCUITest driver is installed: `appium driver list --installed`

### Tests Timing Out
- Increase timeout in test: `{ timeout: 60000 }`
- Check network connectivity between clients
- Verify app is actually running (check logs)

### Permission Errors
- Android: Set `autoGrantPermissions: true` in capabilities
- iOS: Set `autoAcceptAlerts: true` in capabilities

## Performance Considerations

- **Parallelization**: Mobile tests run serially (workers: 1) to avoid resource conflicts
- **Timeouts**: Mobile tests have longer timeouts (30-60s) due to app startup
- **Network Simulation**: Tests use real network conditions, not mocked
- **Resource Cleanup**: Always cleanup clients in `afterEach` hooks

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Setup/Teardown**: Use `beforeEach`/`afterEach` for client management
3. **Screenshots**: Take screenshots on failure for debugging
4. **Timeouts**: Use appropriate timeouts for cross-platform scenarios
5. **Error Handling**: Expect and handle network delays gracefully
6. **Logging**: Use descriptive test names and log important state changes

## Example Test

```typescript
import { test, expect } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient } from '../cross-platform-framework';

test('should send message between clients', async ({ browser, page }) => {
  const coordinator = new CrossPlatformTestCoordinator();
  
  // Setup
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
  
  // Connect clients
  await coordinator.connectClients(client1, client2);
  
  // Test
  const received = await coordinator.sendAndVerifyMessage(
    client1,
    client2,
    'Hello!',
    10000
  );
  
  expect(received).toBe(true);
  
  // Cleanup
  await coordinator.cleanup();
});
```

## Future Enhancements

- [ ] Add performance benchmarks for cross-platform latency
- [ ] Add network condition simulation (3G, 4G, WiFi)
- [ ] Add file transfer tests across platforms
- [ ] Add voice call tests
- [ ] Add visual regression tests for mobile
- [ ] Add accessibility tests for mobile
- [ ] Add battery usage monitoring
- [ ] Add memory leak detection

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Appium Documentation](https://appium.io/docs/en/latest/)
- [WebDriverIO Documentation](https://webdriver.io/)
- [Android Testing](https://developer.android.com/training/testing)
- [iOS Testing](https://developer.apple.com/documentation/xctest)
