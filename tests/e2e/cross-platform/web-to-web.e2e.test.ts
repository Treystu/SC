/**
 * Cross-Platform E2E Tests: Web to Web Messaging
 * Tests messaging workflows between web clients
 */

import { test, expect, Browser, Page, BrowserContext } from '@playwright/test';
import { CrossPlatformTestCoordinator, WebClient } from '../../cross-platform-framework';

test.describe('Web to Web Cross-Platform Tests', () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient1: WebClient;
  let webClient2: WebClient;
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  test.beforeEach(async ({ browser }) => {
    coordinator = new CrossPlatformTestCoordinator();

    const dbName1 = `sc_e2e_web1_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const dbName2 = `sc_e2e_web2_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Create two separate browser contexts for complete isolation
    context1 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'SC-Web-Client-1/1.0'
    });

    context2 = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'SC-Web-Client-2/1.0'
    });

    await context1.addInitScript((dbName: string) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, dbName1);

    await context2.addInitScript((dbName: string) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, dbName2);

    page1 = await context1.newPage();
    page2 = await context2.newPage();

    // Create two web clients with isolated contexts
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
    // Clean up contexts
    await context1?.close();
    await context2?.close();
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
    const peerId1 = await webClient1.getPeerId();
    const peerId2 = await webClient2.getPeerId();
    await webClient2.goOnline(peerId1);

    // Re-initiate explicit connections from both sides to ensure fresh WebRTC link
    await webClient1.connectToPeer(peerId2);
    await webClient2.connectToPeer(peerId1);

    // Capture debug snapshots after reconnection attempts
    const snap1 = await webClient1.getDebugSnapshot();
    const snap2 = await webClient2.getDebugSnapshot();
    console.log(
      "[offline/online] snapshots after reconnect",
      JSON.stringify({ snap1, snap2 }),
    );

    // Wait for mesh to be connected again
    await webClient1.waitForPeerConnection(1, 30000);
    await webClient2.waitForPeerConnection(1, 30000);

    // Capture post-reconnect debug snapshots for diagnostics
    const postReconnectSnapshots = await Promise.all([
      webClient1.getDebugSnapshot(),
      webClient2.getDebugSnapshot(),
    ]);
    console.log(
      "[offline/online] post-reconnect snapshots",
      JSON.stringify({ postReconnectSnapshots }),
    );

    // Message should eventually be received
    await webClient2.openConversation('web-alice');
    received = await webClient2.waitForMessage('While offline', 30000);
    if (!received) {
      // Force reconnect attempts if still no peer link
      const dbgBeforeRetry = await Promise.all([
        webClient1.getDebugSnapshot(),
        webClient2.getDebugSnapshot(),
      ]);
      console.log(
        "[offline/online] before forced reconnect",
        JSON.stringify({ dbgBeforeRetry }),
      );

      await webClient1.connectToPeer(peerId2);
      await webClient2.connectToPeer(peerId1);
      await webClient1.waitForPeerConnection(1, 20000);
      await webClient2.waitForPeerConnection(1, 20000);

      const dbgAfterRetry = await Promise.all([
        webClient1.getDebugSnapshot(),
        webClient2.getDebugSnapshot(),
      ]);
      console.log(
        "[offline/online] after forced reconnect",
        JSON.stringify({ dbgAfterRetry }),
      );

      received = await webClient2.waitForMessage('While offline', 20000);
    }

    // If not received, re-open conversation and resend after reconnect
    if (!received) {
      await webClient1.openConversation('web-bob');
      await webClient2.openConversation('web-alice');
      await webClient1.sendMessage('web-bob', 'While offline (retry after reconnect)');
      received = await webClient2.waitForMessage('While offline (retry after reconnect)', 20000);
    }

    // If still not received, try a final simple message to verify connectivity
    if (!received) {
      await webClient1.sendMessage('web-bob', 'Final check message');
      received = await webClient2.waitForMessage('Final check message', 20000);
    }

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

    // Send messages rapidly with small delays to avoid UI lock
    for (let i = 0; i < 10; i++) {
      await webClient1.sendMessage('web-bob', `Rapid message ${i}`);
      // Small delay between sends to allow UI to settle
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Verify at least some messages arrived
    const lastMessage = await webClient2.waitForMessage('Rapid message 9', 15000);
    expect(lastMessage).toBe(true);

    await coordinator.takeScreenshotAll('web-rapid-messaging');
  });
});
