/**
 * Appium Configuration for Mobile E2E Testing
 * Supports Android (UIAutomator2) and iOS (XCUITest)
 */

export const config = {
  // Appium server configuration
  server: {
    host: process.env.APPIUM_HOST || 'localhost',
    port: parseInt(process.env.APPIUM_PORT || '4723', 10),
    path: '/wd/hub',
  },

  // Android configuration
  android: {
    platformName: 'Android',
    automationName: 'UiAutomator2',
    deviceName: process.env.ANDROID_DEVICE_NAME || 'Android Emulator',
    platformVersion: process.env.ANDROID_VERSION || '13',
    app: process.env.ANDROID_APP_PATH || './android/app/build/outputs/apk/debug/app-debug.apk',
    appPackage: 'com.sovereign.communications',
    appActivity: '.ui.MainActivity',
    autoGrantPermissions: true,
    noReset: false,
    fullReset: false,
    newCommandTimeout: 300,
    // Enable verbose logging for debugging
    showAndroidLog: true,
    // Performance optimizations
    skipDeviceInitialization: false,
    skipServerInstallation: false,
    // Additional capabilities
    unicodeKeyboard: true,
    resetKeyboard: true,
    orientation: 'PORTRAIT',
    // Network simulation
    networkSpeed: 'full',
  },

  // iOS configuration
  ios: {
    platformName: 'iOS',
    automationName: 'XCUITest',
    deviceName: process.env.IOS_DEVICE_NAME || 'iPhone 15',
    platformVersion: process.env.IOS_VERSION || '17.0',
    app: process.env.IOS_APP_PATH || './ios/build/Build/Products/Debug-iphonesimulator/SovereignCommunications.app',
    bundleId: 'com.sovereign.communications',
    autoAcceptAlerts: true,
    autoDismissAlerts: false,
    noReset: false,
    fullReset: false,
    newCommandTimeout: 300,
    // XCUITest specific
    xcodeOrgId: process.env.XCODE_ORG_ID,
    xcodeSigningId: process.env.XCODE_SIGNING_ID || 'iPhone Developer',
    udid: process.env.IOS_UDID || 'auto',
    // Performance optimizations
    useNewWDA: false,
    wdaLaunchTimeout: 120000,
    wdaConnectionTimeout: 120000,
    // Additional capabilities
    orientation: 'PORTRAIT',
    language: 'en',
    locale: 'en_US',
  },

  // Test configuration
  test: {
    timeout: 120000, // 2 minutes per test
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Mobile tests should run serially
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

export default config;
