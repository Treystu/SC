import { test, expect } from "@playwright/test";
import {
  CrossPlatformTestCoordinator,
  WebClient,
  AndroidClient,
} from "../../../cross-platform-framework";

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

test.describe("Web to Android Cross-Platform Tests", () => {
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

    webClient = (await coordinator.createClient(
      { platform: "web", name: "web-client" },
      page,
      browser,
    )) as WebClient;

    androidClient = (await coordinator.createClient({
      platform: "android",
      name: "android-client",
    })) as AndroidClient;
  });

  test.afterEach(async () => {
    if (coordinator) {
      await coordinator.cleanup();
    }
  });

  test("should send message from web to Android", async () => {
    // Exchange contact information
    await coordinator.connectClients(webClient, androidClient);

    // Wait for mesh network
    await coordinator.waitForMeshNetwork(1, 30000);

    // Send message from web to Android
    const testMessage = "Hello from Web to Android!";
    const received = await coordinator.sendAndVerifyMessage(
      webClient,
      androidClient,
      testMessage,
      20000,
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll("web-to-android-message");
  });

  test("should send message from Android to web", async () => {
    await coordinator.connectClients(webClient, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Send message from Android to web
    const testMessage = "Hello from Android to Web!";
    const received = await coordinator.sendAndVerifyMessage(
      androidClient,
      webClient,
      testMessage,
      20000,
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll("android-to-web-message");
  });

  test("should handle bidirectional messaging", async () => {
    await coordinator.connectClients(webClient, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Web to Android
    let received = await coordinator.sendAndVerifyMessage(
      webClient,
      androidClient,
      "Web says hello",
      15000,
    );
    expect(received).toBe(true);

    // Android to Web
    received = await coordinator.sendAndVerifyMessage(
      androidClient,
      webClient,
      "Android replies",
      15000,
    );
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll("web-android-bidirectional");
  });

  test("should maintain message history across platforms", async () => {
    await coordinator.connectClients(webClient, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    const messages = [
      "First cross-platform message",
      "Second cross-platform message",
      "Third cross-platform message",
    ];

    for (const message of messages) {
      const received = await coordinator.sendAndVerifyMessage(
        webClient,
        androidClient,
        message,
        15000,
      );
      expect(received).toBe(true);
    }

    await coordinator.takeScreenshotAll("web-android-history");
  });

  test("should handle network interruptions", async () => {
    await coordinator.connectClients(webClient, androidClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Send initial message
    let received = await coordinator.sendAndVerifyMessage(
      webClient,
      androidClient,
      "Before interruption",
      15000,
    );
    expect(received).toBe(true);

    // Simulate network interruption on Android
    await androidClient.goOffline();
    await webClient.sendMessage("android-client", "During interruption");

    // Restore network
    await androidClient.goOnline();

    // Message should eventually arrive
    received = await androidClient.waitForMessage("During interruption", 40000);
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll("web-android-network-recovery");
  });
});
