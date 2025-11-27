import { test, expect } from '@playwright/test';
import { AppiumDriver } from './appium-driver';
import { PlaywrightDriver } from './playwright-driver';

test.describe('Cross-Platform E2E Tests', () => {
  let androidDriver: AppiumDriver;
  let iosDriver: AppiumDriver;
  let webDriver: PlaywrightDriver;

  test.beforeAll(async ({ playwright }) => {
    // Appium capabilities for Android and iOS
    const androidCaps = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': 'Android Emulator',
      'appium:app': 'path/to/your/android/app.apk',
    };
    const iosCaps = {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': 'iPhone Simulator',
      'appium:app': 'path/to/your/ios/app.app',
    };

    androidDriver = new AppiumDriver('http://localhost:4723/wd/hub', androidCaps);
    iosDriver = new AppiumDriver('http://localhost:4723/wd/hub', iosCaps);
    webDriver = new PlaywrightDriver(await playwright.chromium.launch());
  });

  test.afterAll(async () => {
    await androidDriver.quit();
    await iosDriver.quit();
    await webDriver.quit();
  });

  test('should deliver queued offline message from Android to iOS', async () => {
    // 1. Set Android to offline mode
    await androidDriver.setNetworkConnection(1); // Airplane mode

    // 2. Send a message from Android to iOS
    const message = `offline-message-${Date.now()}`;
    await androidDriver.sendMessage('ios-peer-id', message);

    // 3. Set Android to online mode and connect to iOS
    await androidDriver.setNetworkConnection(6); // WiFi + Data
    await androidDriver.connectToPeer('ios-peer-id');
    await iosDriver.acceptConnection('android-peer-id');

    // 4. Verify message is received on iOS
    const received = await iosDriver.waitForMessage(message, 30000);
    expect(received).toBe(true);
  });

  test('should transfer data from Web to Android via Sneakernet', async () => {
    // 1. Export data from Web
    const backupFile = await webDriver.exportData();

    // 2. Transfer file to Android device
    await androidDriver.pushFile('/sdcard/Download/backup.json', backupFile);

    // 3. Import data on Android
    await androidDriver.importData('/sdcard/Download/backup.json');

    // 4. Verify data is imported
    const imported = await androidDriver.verifyDataImported();
    expect(imported).toBe(true);
  });
});