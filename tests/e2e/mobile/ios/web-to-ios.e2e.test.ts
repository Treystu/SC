import { test, expect } from "@playwright/test";
import {
  CrossPlatformTestCoordinator,
  WebClient,
  iOSClient,
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

test.describe("Web to iOS Cross-Platform Tests", () => {
  let coordinator: CrossPlatformTestCoordinator;
  let webClient: WebClient;
  let iosClient: iOSClient;
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

    iosClient = (await coordinator.createClient({
      platform: "ios",
      name: "ios-client",
    })) as iOSClient;
  });

  test.afterEach(async () => {
    if (coordinator) {
      await coordinator.cleanup();
    }
  });

  test("should send message from web to iOS", async () => {
    // Exchange contact information
    await coordinator.connectClients(webClient, iosClient);

    // Wait for mesh network
    await coordinator.waitForMeshNetwork(1, 30000);

    // Send message from web to iOS
    const testMessage = "Hello from Web to iOS!";
    const received = await coordinator.sendAndVerifyMessage(
      webClient,
      iosClient,
      testMessage,
      20000,
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll("web-to-ios-message");
  });

  test("should send message from iOS to web", async () => {
    await coordinator.connectClients(webClient, iosClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Send message from iOS to web
    const testMessage = "Hello from iOS to Web!";
    const received = await coordinator.sendAndVerifyMessage(
      iosClient,
      webClient,
      testMessage,
      20000,
    );

    expect(received).toBe(true);
    await coordinator.takeScreenshotAll("ios-to-web-message");
  });

  test("should handle bidirectional messaging", async () => {
    await coordinator.connectClients(webClient, iosClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    // Web to iOS
    let received = await coordinator.sendAndVerifyMessage(
      webClient,
      iosClient,
      "Web says hello",
      15000,
    );
    expect(received).toBe(true);

    // iOS to Web
    received = await coordinator.sendAndVerifyMessage(
      iosClient,
      webClient,
      "iOS replies",
      15000,
    );
    expect(received).toBe(true);

    await coordinator.takeScreenshotAll("web-ios-bidirectional");
  });

  test("should maintain message history across platforms", async () => {
    await coordinator.connectClients(webClient, iosClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    const messages = [
      "First cross-platform message",
      "Second cross-platform message",
      "Third cross-platform message",
    ];

    for (const message of messages) {
      const received = await coordinator.sendAndVerifyMessage(
        webClient,
        iosClient,
        message,
        15000,
      );
      expect(received).toBe(true);
    }

    await coordinator.takeScreenshotAll("web-ios-history");
  });

  test("should support rich text and emoji", async () => {
    await coordinator.connectClients(webClient, iosClient);
    await coordinator.waitForMeshNetwork(1, 30000);

    const richMessages = [
      "Hello 👋 from web",
      "iOS emoji support 🎉",
      "Special chars: café, naïve",
    ];

    for (const message of richMessages) {
      const received = await coordinator.sendAndVerifyMessage(
        webClient,
        iosClient,
        message,
        15000,
      );
      expect(received).toBe(true);
    }

    await coordinator.takeScreenshotAll("web-ios-rich-text");
  });
});
