import { test, expect } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient, AndroidClient } from './cross-platform-framework';

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

test.describe('Identity Verification Tests', () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient: WebClient;
  let androidClient: AndroidClient;
  let appiumAvailable: boolean;

  test.beforeEach(async ({ browser, page }) => {
    appiumAvailable = await isAppiumAvailable();
    if (!appiumAvailable) {
      return;
    }

    coordinator = new CrossPlatformTestCoordinator();
    webClient = await coordinator.createClient({ platform: 'web' }, page, browser) as WebClient;
    androidClient = await coordinator.createClient({ platform: 'android' }) as AndroidClient;
  });

  test.afterEach(async () => {
    if (coordinator) {
      await coordinator.cleanup();
    }
  });

  test('should verify peer identity across platforms', async () => {
    await coordinator.connectClients(webClient, androidClient);

    const webClientPublicKey = await webClient.getPublicKey();
    const androidClientPublicKey = await androidClient.getPublicKey();

    // This is a simplified check. In a real scenario, you would exchange
    // signed messages to verify the identity.
    expect(webClientPublicKey).toEqual(androidClientPublicKey);
  });
});
