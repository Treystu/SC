import { test, expect, Browser, Page } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient, AndroidClient, iOSClient } from '../../cross-platform-framework';

async function isAppiumAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:4723/status', {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  const available = await isAppiumAvailable();
  if (!available) {
    test.skip();
  }
});

test.describe('Multi-platform Cross-Platform Tests', () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient: WebClient;
  let androidClient: AndroidClient;
  let iosClient: iOSClient;
  let browser1: Browser;
  let page1: Page;
  let appiumAvailable: boolean;

  test.beforeEach(async ({ browser, context }) => {
    appiumAvailable = await isAppiumAvailable();
    if (!appiumAvailable) {
      return;
    }
    
    coordinator = new CrossPlatformTestCoordinator();

    const context1 = await browser.newContext();
    page1 = await context1.newPage();

    webClient = await coordinator.createClient(
      { platform: 'web', name: 'web-alice' },
      page1,
      browser
    ) as WebClient;

    androidClient = await coordinator.createClient(
      { platform: 'android', name: 'android-bob' }
    ) as AndroidClient;
    
    iosClient = await coordinator.createClient(
        { platform: 'ios', name: 'ios-charlie' }
    ) as iOSClient;
  });

  test.afterEach(async () => {
    if (coordinator) {
      await coordinator.cleanup();
    }
  });

  test('should send a message from web to mobile and receive it', async () => {
    await coordinator.connectClients(webClient, androidClient);

    const testMessage = 'Hello from Web Client!';
    const received = await coordinator.sendAndVerifyMessage(
      webClient,
      androidClient,
      testMessage,
      15000
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll('multi-platform-web-to-mobile');
  });
  
  test('should relay a message through a multi-hop network', async () => {
    await coordinator.connectClients(webClient, androidClient);
    await coordinator.connectClients(androidClient, iosClient);

    const testMessage = 'Hello from Web, relayed by Android!';
    const received = await coordinator.sendAndVerifyMessage(
      webClient,
      iosClient,
      testMessage,
      30000
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll('multi-platform-multi-hop');
  });

  test('should send and receive messages in a group chat', async () => {
    await coordinator.createGroup([webClient, androidClient, iosClient]);

    const webMessage = 'Hello group from web!';
    await webClient.sendMessageToGroup(webMessage);
    
    const androidReceived = await androidClient.waitForGroupMessage(webMessage, 15000);
    const iosReceived = await iosClient.waitForGroupMessage(webMessage, 15000);
    
    expect(androidReceived).toBe(true);
    expect(iosReceived).toBe(true);
    
    const androidMessage = 'Hello group from Android!';
    await androidClient.sendMessageToGroup(androidMessage);
    
    const webReceived = await webClient.waitForGroupMessage(androidMessage, 15000);
    const iosReceived2 = await iosClient.waitForGroupMessage(androidMessage, 15000);
    
    expect(webReceived).toBe(true);
    expect(iosReceived2).toBe(true);

    await coordinator.takeScreenshotAll('multi-platform-group-chat');
  });
});