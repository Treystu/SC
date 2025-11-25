/**
 * Cross-Platform E2E Tests: Multi-Platform Mesh Network
 * Tests messaging workflows across web, Android, and iOS simultaneously
 */

import { test, expect } from '@playwright/test';
import {
  CrossPlatformTestCoordinator,
  WebClient,
  AndroidClient,
  iOSClient
} from '../../cross-platform-framework';

test.describe.skip('Multi-Platform Mesh Network Tests', () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient1: WebClient;
  let webClient2: WebClient;
  let androidClient: AndroidClient;
  let iosClient: iOSClient;

  test.beforeEach(async ({ browser }) => {
    coordinator = new CrossPlatformTestCoordinator();

    // Create multiple web clients
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

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

    // Create Android client
    androidClient = await coordinator.createClient(
      { platform: 'android', name: 'android-charlie' }
    ) as AndroidClient;

    // Create iOS client
    iosClient = await coordinator.createClient(
      { platform: 'ios', name: 'ios-david' }
    ) as iOSClient;
  });

  test.afterEach(async () => {
    await coordinator.cleanup();
  });

  test('should establish 4-node mesh network', async () => {
    // Connect all clients in a mesh
    await coordinator.connectClients(webClient1, webClient2);
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.connectClients(webClient1, iosClient);
    await coordinator.connectClients(webClient2, androidClient);
    await coordinator.connectClients(webClient2, iosClient);
    await coordinator.connectClients(androidClient, iosClient);

    // Wait for mesh network to stabilize
    await coordinator.waitForMeshNetwork(3, 60000);

    // Verify all nodes are connected
    const clients = coordinator.getAllClients();
    for (const client of clients) {
      const peerCount = await client.getPeerCount();
      expect(peerCount).toBeGreaterThanOrEqual(3);
    }

    await coordinator.takeScreenshotAll('4-node-mesh-network');
  });

  test('should broadcast message to all platforms', async () => {
    // Setup mesh network
    await coordinator.connectClients(webClient1, webClient2);
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.connectClients(webClient1, iosClient);
    await coordinator.waitForMeshNetwork(1, 60000);

    // Broadcast from web client 1
    const broadcastMessage = 'Broadcast to all platforms!';

    await webClient1.sendMessage('web-bob', broadcastMessage);
    await webClient1.sendMessage('android-charlie', broadcastMessage);
    await webClient1.sendMessage('ios-david', broadcastMessage);

    // Verify all clients received it
    const received = await Promise.all([
      webClient2.waitForMessage(broadcastMessage, 20000),
      androidClient.waitForMessage(broadcastMessage, 20000),
      iosClient.waitForMessage(broadcastMessage, 20000),
    ]);

    received.forEach(r => expect(r).toBe(true));
    await coordinator.takeScreenshotAll('broadcast-message');
  });

  test('should handle group conversation across platforms', async () => {
    await coordinator.connectClients(webClient1, webClient2);
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.connectClients(webClient2, iosClient);
    await coordinator.waitForMeshNetwork(1, 60000);

    // Simulate group conversation
    const messages = [
      { sender: webClient1, recipient: 'web-bob', text: 'Alice: Hi everyone!' },
      { sender: webClient2, recipient: 'android-charlie', text: 'Bob: Hey Alice!' },
      { sender: androidClient, recipient: 'web-alice', text: 'Charlie: Hello from Android!' },
      { sender: iosClient, recipient: 'web-alice', text: 'David: iOS here!' },
    ];

    for (const msg of messages) {
      await msg.sender.sendMessage(msg.recipient, msg.text);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Spacing for readability
    }

    await coordinator.takeScreenshotAll('group-conversation');
  });

  test('should handle multi-platform file transfer', async () => {
    test.skip(); // Skip until file transfer is implemented

    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // TODO: Implement file transfer test once feature is available
  });

  test('should recover from partial network failure', async () => {
    await coordinator.connectClients(webClient1, webClient2);
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.connectClients(webClient1, iosClient);
    await coordinator.waitForMeshNetwork(1, 60000);

    // Send initial message
    let received = await coordinator.sendAndVerifyMessage(
      webClient1,
      androidClient,
      'Before failure',
      15000
    );
    expect(received).toBe(true);

    // Take Android offline
    await androidClient.goOffline();

    // Messages should still flow between other clients
    received = await coordinator.sendAndVerifyMessage(
      webClient1,
      webClient2,
      'During Android offline',
      15000
    );
    expect(received).toBe(true);

    received = await coordinator.sendAndVerifyMessage(
      webClient1,
      iosClient,
      'iOS still online',
      15000
    );
    expect(received).toBe(true);

    // Bring Android back online
    await androidClient.goOnline();

    // Android should reconnect
    await androidClient.waitForPeerConnection(1, 40000);

    received = await coordinator.sendAndVerifyMessage(
      webClient1,
      androidClient,
      'After recovery',
      20000
    );
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll('network-recovery');
  });

  test('should maintain consistent state across platforms', async () => {
    await coordinator.connectClients(webClient1, webClient2);
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.connectClients(webClient1, iosClient);
    await coordinator.waitForMeshNetwork(1, 60000);

    // Send messages from different platforms
    const messages = [
      'Message 1 from web',
      'Message 2 from web',
      'Message 3 from web',
    ];

    for (const msg of messages) {
      await webClient1.sendMessage('web-bob', msg);
    }

    // All platforms should see the same message history
    for (const msg of messages) {
      const receivedOnWeb = await webClient2.waitForMessage(msg, 15000);
      expect(receivedOnWeb).toBe(true);
    }

    await coordinator.takeScreenshotAll('consistent-state');
  });

  test('should handle rapid cross-platform messaging', async () => {
    await coordinator.connectClients(webClient1, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Rapid bidirectional messaging
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(webClient1.sendMessage('android-charlie', `Web message ${i}`));
      promises.push(androidClient.sendMessage('web-alice', `Android message ${i}`));
    }

    await Promise.all(promises);

    // Verify last messages arrived
    const webReceived = await androidClient.waitForMessage('Web message 4', 20000);
    const androidReceived = await webClient1.waitForMessage('Android message 4', 20000);

    expect(webReceived).toBe(true);
    expect(androidReceived).toBe(true);

    await coordinator.takeScreenshotAll('rapid-cross-platform');
  });
});
