/**
 * Cross-Platform E2E Tests: Web to Web Messaging
 * Tests messaging workflows between web clients
 */

import { test, expect, Browser, Page } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient } from '../../cross-platform-framework';

test.describe.skip('Web to Web Cross-Platform Tests', () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient1: WebClient;
  let webClient2: WebClient;
  let browser1: Browser;
  let browser2: Browser;
  let page1: Page;
  let page2: Page;

  test.beforeEach(async ({ browser, context }) => {
    coordinator = new CrossPlatformTestCoordinator();

    // Create two separate browser contexts for isolation
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    page1 = await context1.newPage();
    page2 = await context2.newPage();

    // Create two web clients
    webClient1 = await coordinator.createClient(
      { platform: 'web', name: 'web-alice' },
      page1,
      browser
    ) as WebClient;

    webClient2 = await coordinator.createClient(
      { platform: 'web', name: 'web-bob' },
      page2,
      browser
    ) as WebClient;
  });

  test.afterEach(async () => {
    await coordinator.cleanup();
  });

  test('should send message from one web client to another', async () => {
    // Exchange contact information
    await coordinator.connectClients(webClient1, webClient2);

    // Send message from client 1 to client 2
    const testMessage = 'Hello from Web Client 1!';
    const received = await coordinator.sendAndVerifyMessage(
      webClient1,
      webClient2,
      testMessage,
      15000
    );

    expect(received).toBe(true);

    // Take screenshots for verification
    await coordinator.takeScreenshotAll('web-to-web-message-sent');
  });

  test('should handle bidirectional messaging', async () => {
    // Exchange contact information
    await coordinator.connectClients(webClient1, webClient2);

    // Send message from client 1 to client 2
    const message1 = 'Message from Alice';
    let received = await coordinator.sendAndVerifyMessage(
      webClient1,
      webClient2,
      message1,
      15000
    );
    expect(received).toBe(true);

    // Send reply from client 2 to client 1
    const message2 = 'Reply from Bob';
    received = await coordinator.sendAndVerifyMessage(
      webClient2,
      webClient1,
      message2,
      15000
    );
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll('web-bidirectional-messaging');
  });

  test('should maintain message history', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    // Send multiple messages
    const messages = [
      'First message',
      'Second message',
      'Third message',
    ];

    for (const message of messages) {
      const received = await coordinator.sendAndVerifyMessage(
        webClient1,
        webClient2,
        message,
        10000
      );
      expect(received).toBe(true);
    }

    // Verify all messages are visible
    for (const message of messages) {
      const visible = await webClient2.waitForMessage(message, 2000);
      expect(visible).toBe(true);
    }

    await coordinator.takeScreenshotAll('web-message-history');
  });

  test('should handle offline/online transitions', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    // Send initial message
    let received = await coordinator.sendAndVerifyMessage(
      webClient1,
      webClient2,
      'Before offline',
      10000
    );
    expect(received).toBe(true);

    // Take client 2 offline
    await webClient2.goOffline();

    // Send message while offline (should queue)
    await webClient1.sendMessage('web-bob', 'While offline');

    // Bring client 2 back online
    await webClient2.goOnline();

    // Message should eventually be received
    received = await webClient2.waitForMessage('While offline', 30000);
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll('web-offline-online');
  });

  test('should support emoji and special characters', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    const specialMessages = [
      'Hello 👋 World 🌍',
      'Test with émojis and àccents',
      '中文测试 Japanese: 日本語',
      'Math: ∑ ∫ ∂ √ ∞',
    ];

    for (const message of specialMessages) {
      const received = await coordinator.sendAndVerifyMessage(
        webClient1,
        webClient2,
        message,
        10000
      );
      expect(received).toBe(true);
    }

    await coordinator.takeScreenshotAll('web-special-characters');
  });

  test('should handle long messages', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    const longMessage = 'A'.repeat(1000) + ' - This is a long message';
    const received = await coordinator.sendAndVerifyMessage(
      webClient1,
      webClient2,
      longMessage,
      15000
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll('web-long-message');
  });

  test('should establish mesh network with peer connections', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    // Wait for mesh network to establish
    await coordinator.waitForMeshNetwork(1, 20000);

    // Verify peer counts
    const peerCount1 = await webClient1.getPeerCount();
    const peerCount2 = await webClient2.getPeerCount();

    expect(peerCount1).toBeGreaterThanOrEqual(1);
    expect(peerCount2).toBeGreaterThanOrEqual(1);

    await coordinator.takeScreenshotAll('web-mesh-network');
  });

  test('should handle rapid message sending', async () => {
    await coordinator.connectClients(webClient1, webClient2);

    // Send messages rapidly
    const messagePromises = [];
    for (let i = 0; i < 10; i++) {
      messagePromises.push(
        webClient1.sendMessage('web-bob', `Rapid message ${i}`)
      );
    }

    await Promise.all(messagePromises);

    // Verify at least some messages arrived
    const lastMessage = await webClient2.waitForMessage('Rapid message 9', 15000);
    expect(lastMessage).toBe(true);

    await coordinator.takeScreenshotAll('web-rapid-messaging');
  });
});
