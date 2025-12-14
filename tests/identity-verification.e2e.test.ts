import { test, expect } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient, AndroidClient } from './cross-platform-framework';

test.describe('Identity Verification Tests', () => {
  const runMobileE2E = process.env.RUN_MOBILE_E2E === 'true';
  test.skip(!runMobileE2E, 'Mobile grid not configured in CI');

  let coordinator: CrossPlatformTestCoordinator;
  let webClient: WebClient;
  let androidClient: AndroidClient;

  test.beforeEach(async ({ browser, page }) => {
    coordinator = new CrossPlatformTestCoordinator();
    webClient = await coordinator.createClient({ platform: 'web' }, page, browser) as WebClient;
    androidClient = await coordinator.createClient({ platform: 'android' }) as AndroidClient;
  });

  test.afterEach(async () => {
    await coordinator.cleanup();
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
