/**
 * Cross-Platform E2E Test Framework
 * Coordinates testing across Web, Android, and iOS platforms
 */

import { Page, Browser } from "@playwright/test";
import {
  remote,
  RemoteOptions,
  Browser as WebdriverBrowser,
} from "webdriverio";
import { config } from "../appium.config";

export type Platform = "web" | "android" | "ios";

export interface ClientOptions {
  platform: Platform;
  name?: string;
}

export interface Message {
  content: string;
  timestamp: Date;
  sender: string;
}

/**
 * Abstract client interface for cross-platform operations
 */
export abstract class PlatformClient {
  protected clientId: string;
  protected platform: Platform;

  constructor(clientId: string, platform: Platform) {
    this.clientId = clientId;
    this.platform = platform;
  }

  abstract initialize(): Promise<void>;
  abstract cleanup(): Promise<void>;
  abstract sendMessage(contactName: string, message: string): Promise<void>;
  abstract waitForMessage(message: string, timeout?: number): Promise<boolean>;
  abstract addContact(name: string, publicKey: string): Promise<void>;
  abstract getPeerCount(): Promise<number>;
  abstract waitForPeerConnection(
    expectedCount: number,
    timeout?: number,
  ): Promise<void>;
  abstract getPublicKey(): Promise<string>;
  abstract takeScreenshot(name: string): Promise<void>;
  abstract goOffline(): Promise<void>;
  abstract goOnline(): Promise<void>;

  async getPeerId(): Promise<string> {
    return this.clientId;
  }

  async openConversation(_contactName: string): Promise<void> {
    // Default no-op for platforms where UI selection isn't modeled.
    // WebClient overrides this to ensure the correct chat is open before assertions.
  }

  async joinRoom(_url: string): Promise<void> {
    // Default no-op for non-web clients.
  }

  async connectToPeer(_peerId: string): Promise<void> {
    // Default no-op for non-web clients.
  }

  async waitForPeer(_peerId: string, _timeout = 30000): Promise<void> {
    // Default no-op for non-web clients.
  }

  async waitForDiscoveredPeer(_peerId: string, _timeout = 30000): Promise<void> {
    // Default no-op for non-web clients.
  }

  async getDebugSnapshot(): Promise<Record<string, any>> {
    return {
      clientId: this.clientId,
      platform: this.platform,
    };
  }

  // Group messaging methods (with default implementations that can be overridden)
  async sendMessageToGroup(message: string): Promise<void> {
    throw new Error("sendMessageToGroup not implemented for this platform");
  }

  async waitForGroupMessage(
    message: string,
    timeout?: number,
  ): Promise<boolean> {
    throw new Error("waitForGroupMessage not implemented for this platform");
  }

  getId(): string {
    return this.clientId;
  }

  getPlatform(): Platform {
    return this.platform;
  }
}

/**
 * Web client using Playwright
 */
export class WebClient extends PlatformClient {
  private page: Page;
  private browser: Browser;
  private consoleLogs: string[] = [];
  private lastContactPeerIds: string[] = [];

  constructor(clientId: string, page: Page, browser: Browser) {
    super(clientId, "web");
    this.page = page;
    this.browser = browser;

    // Capture browser logs for debugging flaky E2E signaling/transport issues
    this.page.on("console", (msg) => {
      const line = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(line);
      if (this.consoleLogs.length > 200) {
        this.consoleLogs.splice(0, this.consoleLogs.length - 200);
      }
    });
  }

  async initialize(): Promise<void> {
    // Navigate to page
    await this.page.goto("/");
    await this.page.waitForLoadState("domcontentloaded");

    // WebKit can be slower to initialize; increase timeout and add retries
    const maxRetries = 3;
    let retries = 0;
    while (retries < maxRetries) {
      try {
        // Ensure mesh status is exposed
        await this.page.waitForFunction(() => {
          const s = (window as any).__SC_STATUS__;
          return !!s;
        }, { timeout: 30000 });
        break; // Success, exit retry loop
      } catch (e) {
        retries++;
        if (retries >= maxRetries) throw e;
        // Brief pause before retry
        await this.page.waitForTimeout(1000);
      }
    }

    // Ensure identity exists (some tests run with completely fresh DB)
    const hasPeerId = await this.page
      .waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId, undefined, {
        timeout: 2000,
      })
      .then(() => true)
      .catch(() => false);

    if (!hasPeerId) {
      try {
        const getStarted = this.page.getByRole("button", { name: "Get Started" });
        if (await getStarted.isVisible({ timeout: 2000 })) {
          await getStarted.click();
        }
      } catch {
        // ignore
      }

      try {
        const displayNameInput = this.page.getByPlaceholder("Display Name");
        if (await displayNameInput.isVisible({ timeout: 5000 })) {
          await displayNameInput.fill(this.clientId);
          await displayNameInput.press("Enter");
        }
      } catch {
        // ignore
      }

      // Fallback: use exposed E2E helper if UI isn't present
      await this.page.evaluate(async (displayName: string) => {
        const win = window as any;
        if (typeof win.e2eCreateIdentity === "function") {
          await win.e2eCreateIdentity(displayName);
        }
      }, this.clientId);

      await this.page.waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId, undefined, {
        timeout: 15000,
      });
    }
  }

  async cleanup(): Promise<void> {
    await this.page.close();
  }

  async sendMessage(contactName: string, message: string): Promise<void> {
    // Prefer opening the conversation thread, but don't hard-fail if we're already in it
    // (e.g. when the coordinator opens the conversation separately).
    try {
      await this.page.click(`[data-testid="contact-${contactName}"]`, {
        timeout: 3000,
      });
    } catch {
      // ignore
    }
    await this.page.waitForSelector('[data-testid="chat-container"]', {
      timeout: 10000,
    });
    await this.page.waitForSelector('[data-testid="message-input"]', {
      timeout: 10000,
    });

    await this.page.fill('[data-testid="message-input"]', message);

    // Wait until the send button is enabled (React state updates can be async)
    const sendBtn = this.page.locator('[data-testid="send-message-btn"]');
    await sendBtn.waitFor({ state: "visible", timeout: 10000 });
    await this.page.waitForFunction(() => {
      const btn = document.querySelector('[data-testid="send-message-btn"]') as HTMLButtonElement | null;
      return !!btn && btn.disabled === false;
    }, undefined, { timeout: 10000 });

    await sendBtn.click();
    // Brief pause after send before returning to allow UI to settle
    await this.page.waitForTimeout(200);
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    try {
      // Prefer checking the app's in-memory state exposed for E2E
      const inState = await this.page
        .waitForFunction(
          (msg) => {
            const w = window as any;
            const msgs = Array.isArray(w.messages) ? w.messages : [];
            return msgs.some((m: any) =>
              typeof m?.content === "string" && m.content.includes(String(msg)),
            );
          },
          message,
          { timeout: Math.min(timeout, 8000) },
        )
        .then(() => true)
        .catch(() => false);

      if (inState) return true;

      // Fallback: UI assertion scoped to the chat message container
      const container = this.page.locator('[data-testid="message-container"]');
      await container.waitFor({ state: "visible", timeout });
      await container.locator(`text=${message}`).waitFor({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    // Open the add menu
    await this.page.click('[data-testid="add-contact-btn"]');

    // Click "Add by ID" (opens AddContactDialog)
    await this.page.waitForSelector('[data-testid="add-by-id-btn"]', {
      timeout: 5000,
    });
    await this.page.click('[data-testid="add-by-id-btn"]');

    // Fill dialog inputs
    await this.page.waitForSelector('[data-testid="contact-name-input"]', {
      timeout: 5000,
    });
    await this.page.fill('[data-testid="contact-name-input"]', name);
    await this.page.fill('[data-testid="contact-publickey-input"]', publicKey);

    // Submit
    await this.page.click('[data-testid="save-contact-btn"]');

    // Wait for conversation to appear
    await this.page.waitForSelector(`[data-testid="contact-${name}"]`, {
      timeout: 15000,
    });

    // Track explicit contacts for reconnection after offline/online
    if (publicKey) {
      this.lastContactPeerIds.push(publicKey);
    }
  }

  async openConversation(contactName: string): Promise<void> {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    await this.page.waitForSelector('[data-testid="chat-container"]', {
      timeout: 10000,
    });
  }

  async getPeerCount(): Promise<number> {
    const count = await this.page.evaluate(() => {
      const w = window as any;
      if (Array.isArray(w.peers)) return w.peers.length;
      if (Array.isArray(w.__SC_STATUS__?.peers)) return w.__SC_STATUS__.peers.length;
      return null;
    });

    if (typeof count === "number") return count;

    const peerCountText = await this.page.textContent('[data-testid="peer-count"]');
    return parseInt(peerCountText || "0", 10);
  }

  async waitForPeerConnection(
    expectedCount: number,
    timeout = 10000,
  ): Promise<void> {
    try {
      await this.page.waitForFunction(
        (count) => {
          const w = window as any;
          if (Array.isArray(w.peers)) return w.peers.length >= count;
          if (Array.isArray(w.__SC_STATUS__?.peers)) return w.__SC_STATUS__.peers.length >= count;
          const elem = document.querySelector('[data-testid="peer-count"]');
          return elem && parseInt(elem.textContent || "0", 10) >= count;
        },
        expectedCount,
        { timeout },
      );
    } catch (err) {
      const debug = await this.page.evaluate(() => {
        const w = window as any;
        return {
          localPeerId: w.__SC_STATUS__?.localPeerId ?? null,
          isJoinedToRoom: w.isJoinedToRoom ?? null,
          discoveredPeers: Array.isArray(w.discoveredPeers) ? w.discoveredPeers : null,
          peers: Array.isArray(w.peers) ? w.peers : null,
          statusPeers: w.__SC_STATUS__?.peers ?? null,
        };
      });
      const recentLogs = this.consoleLogs.slice(-30);
      // Also capture a snapshot on timeout for deeper diagnostics
      const snapshot = await this.getDebugSnapshot();
      throw new Error(
        `waitForPeerConnection timed out. Expected >= ${expectedCount}. Debug: ${JSON.stringify(
          debug,
        )}\nRecent console logs:\n${recentLogs.join("\n")}\nDebug snapshot: ${JSON.stringify(snapshot)}\nOriginal error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  override async waitForDiscoveredPeer(
    peerId: string,
    timeout = 30000,
  ): Promise<void> {
    await this.page.waitForFunction(
      (targetPeerId) => {
        const w = window as any;
        const discovered = Array.isArray(w.discoveredPeers) ? w.discoveredPeers : [];
        return discovered.some((p: any) => {
          const id = typeof p === "string" ? p : p?.id;
          return typeof id === "string" && id.toLowerCase() === String(targetPeerId).toLowerCase();
        });
      },
      peerId,
      { timeout },
    );
  }

  async getPublicKey(): Promise<string> {
    return await this.page.evaluate(() => {
      const identity = JSON.parse(localStorage.getItem("identity") || "{}");
      return identity.publicKey || "";
    });
  }

  override async getPeerId(): Promise<string> {
    return await this.page.evaluate(() => {
      return (window as any).__SC_STATUS__?.localPeerId || "";
    });
  }

  override async joinRoom(url: string): Promise<void> {
    await this.page.evaluate(async (roomUrl: string) => {
      const win = window as any;
      if (typeof win.joinRoom !== "function") {
        throw new Error("window.joinRoom helper not available");
      }
      await win.joinRoom(roomUrl);
    }, url);

    await this.page.waitForFunction(() => (window as any).isJoinedToRoom === true, undefined, {
      timeout: 20000,
    });
  }

  override async connectToPeer(peerId: string): Promise<void> {
    await this.page.evaluate(async (targetPeerId: string) => {
      const win = window as any;
      if (typeof win.connectToPeer !== "function") return;
      await win.connectToPeer(targetPeerId);
    }, peerId);
    // Give a brief moment for the WebRTC handshake to start
    await this.page.waitForTimeout(300);
  }

  override async waitForPeer(peerId: string, timeout = 30000): Promise<void> {
    try {
      await this.page.waitForFunction(
        (targetPeerId) => {
          const w = window as any;
          const peers =
            (Array.isArray(w.peers) ? w.peers : []) ??
            (Array.isArray(w.__SC_STATUS__?.peers) ? w.__SC_STATUS__?.peers : []);
          return peers.some((p: any) => {
            const id = typeof p === "string" ? p : p?.id;
            return (
              typeof id === "string" &&
              id.toLowerCase() === String(targetPeerId).toLowerCase()
            );
          });
        },
        peerId,
        { timeout },
      );
    } catch (e) {
      const debug = await this.page.evaluate(() => {
        const w = window as any;
        return {
          localPeerId: w.__SC_STATUS__?.localPeerId || null,
          isJoinedToRoom: w.isJoinedToRoom ?? null,
          discoveredPeers: Array.isArray(w.discoveredPeers)
            ? w.discoveredPeers
            : null,
          peers: Array.isArray(w.peers) ? w.peers : null,
        };
      });

      const recentLogs = this.consoleLogs.slice(-50);

      throw new Error(
        `waitForPeer timeout waiting for ${peerId}. Debug: ${JSON.stringify(debug)}\nRecent console logs:\n${recentLogs.join("\n")}`,
      );
    }
  }

  override async getDebugSnapshot(): Promise<Record<string, any>> {
    const pageState = await this.page.evaluate(() => {
      const w = window as any;
      const peers = Array.isArray(w.peers) ? w.peers : [];
      const msgs = Array.isArray(w.messages) ? w.messages : [];
      return {
        localPeerId: w.__SC_STATUS__?.localPeerId || null,
        isJoinedToRoom: w.isJoinedToRoom ?? null,
        discoveredPeers: Array.isArray(w.discoveredPeers) ? w.discoveredPeers : null,
        peers,
        messagesCount: msgs.length,
        lastMessages: msgs.slice(-5).map((m: any) => ({
          content: m?.content,
          from: m?.from,
          to: m?.to,
          conversationId: m?.conversationId,
          timestamp: m?.timestamp,
          status: m?.status,
        })),
      };
    });

    return {
      clientId: this.clientId,
      platform: this.platform,
      pageState,
      recentConsoleLogs: this.consoleLogs.slice(-25),
    };
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `screenshots/${this.platform}-${this.clientId}-${name}.png`,
      fullPage: true,
    });
  }

  async goOffline(): Promise<void> {
    // Toggle offline mode at the browser context level
    await this.page.context().setOffline(true);
    // Give the app a moment to react (service workers, network status)
    await this.page.waitForTimeout(500);
  }

  async goOnline(targetPeerId?: string): Promise<void> {
    const localPeerId =
      (await this.page.evaluate(() => (window as any).__SC_STATUS__?.localPeerId)) || null;

    // Restore network
    await this.page.context().setOffline(false);
    // Reload to force mesh re-init and room rejoin
    await this.page.reload({ waitUntil: "domcontentloaded" });
    // Give SW/network a brief moment to settle
    await this.page.waitForTimeout(500);

    // Wait for identity to be ready
    await this.page.waitForFunction(
      () => (window as any).__SC_STATUS__?.localPeerId,
      null,
      { timeout: 15000 },
    );

    // Ensure we are joined to the signaling room again
    const ROOM_URL = "https://sovcom.netlify.app/.netlify/functions/room";
    await this.page.evaluate(async (roomUrl: string) => {
      const win = window as any;
      if (typeof win.joinRoom === "function") {
        try {
          await win.joinRoom(roomUrl);
        } catch {
          // ignore
        }
      }
    }, ROOM_URL);

    // Wait until the app reports joined
    await this.page.waitForFunction(
      () => (window as any).isJoinedToRoom === true,
      null,
      { timeout: 15000 },
    );

    // Explicitly clear stale peer lists and any existing RTCPeerConnections to avoid ghost IDs
    await this.page.evaluate(() => {
      const w = window as any;
      w.peers = [];
      w.discoveredPeers = [];
      // Force disconnect any existing peer connections by calling the exposed reset helper if available
      if (typeof w.__SC_RESET_MESH__ === "function") {
        w.__SC_RESET_MESH__();
      }
      // Also clear any pending room messages to avoid stale state
      if (Array.isArray(w.roomMessages)) {
        w.roomMessages = [];
      }
    });
    // Small pause to let cleanup settle
    await this.page.waitForTimeout(300);

    // Wait for discovered peers list to repopulate after rejoin (if any)
    let discovered: string[] = [];
    try {
      discovered = await this.page
        .waitForFunction(() => {
          const w = window as any;
          if (!Array.isArray(w.discoveredPeers)) return null;
          return w.discoveredPeers.filter((p: any) => typeof p === "string" && p.length > 0);
        }, null, { timeout: 10000 })
        .then((res) => res as unknown as string[])
        .catch(() => []);
    } catch {
      discovered = [];
    }
    if (!Array.isArray(discovered)) {
      discovered = [];
    }
    if (localPeerId) {
      discovered = Array.isArray(discovered)
        ? discovered.filter((p) => p !== localPeerId)
        : [];
    }

    // Proactively reconnect to discovered peers (auto-connect is disabled in E2E)
    if (discovered.length > 0) {
      for (const pid of discovered) {
        await this.page.evaluate(async (peerId: string) => {
          const win = window as any;
          if (typeof win.connectToPeer !== "function") return;
          try {
            await win.connectToPeer(peerId);
          } catch (e) {
            console.warn("Failed to reconnect to peer after online:", peerId, e);
          }
        }, pid);
        // Small delay between reconnections to avoid race conditions
        await this.page.waitForTimeout(200);
      }
    }

    // Also reconnect to explicit contacts + targetPeerId
    const targets = Array.from(
      new Set([
        ...this.lastContactPeerIds,
        ...(targetPeerId ? [targetPeerId] : []),
      ]),
    );
    if (targets.length > 0) {
      for (const pid of targets) {
        await this.page.evaluate(async (peerId: string) => {
          const win = window as any;
          if (typeof win.connectToPeer !== "function") return;
          try {
            await win.connectToPeer(peerId);
          } catch (e) {
            console.warn("Failed to reconnect (contact list) to peer after online:", peerId, e);
          }
        }, pid);
        // Small delay between reconnections to avoid race conditions
        await this.page.waitForTimeout(200);
      }

      for (const pid of targets) {
        try {
          await this.waitForPeer(pid, 15000);
        } catch {
          // ignore; waitForMessage will surface if still disconnected
        }
      }
    }

    // Final guard: wait for at least one connected peer if any targets/discovered existed
    const expected =
      (Array.isArray(discovered) ? discovered : []).length +
        (Array.isArray(targets) ? targets : []).length >
      0
        ? 1
        : 0;
    if (expected > 0) {
      try {
        await this.waitForPeerConnection(expected, 30000);
      } catch (e) {
        // On failure, capture a debug snapshot to diagnose
        const snapshot = await this.getDebugSnapshot();
        console.error(
          `[goOnline] Failed to establish peer connection after reconnect. Debug snapshot: ${JSON.stringify(
            snapshot,
          )}`,
        );
        // swallow; downstream waits/tests will report if still disconnected
      }
    }
  }

  async sendMessageToGroup(message: string): Promise<void> {
    await this.page.fill('[data-testid="group-message-input"]', message);
    await this.page.click('[data-testid="send-group-message-btn"]');
  }

  async waitForGroupMessage(
    message: string,
    timeout = 10000,
  ): Promise<boolean> {
    try {
      await this.page.waitForSelector(
        `[data-testid="group-message"]:has-text("${message}")`,
        { timeout },
      );
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Android client using Appium/WebDriverIO
 */
export class AndroidClient extends PlatformClient {
  private driver?: WebdriverBrowser;

  constructor(clientId: string) {
    super(clientId, "android");
  }

  async initialize(): Promise<void> {
    // Build W3C capabilities with nested appium:options
    const { platformName, ...appiumOpts } = config.android;
    const capabilities = {
      platformName,
      "appium:options": {
        ...appiumOpts,
        deviceName: `${config.android.deviceName}-${this.clientId}`,
      },
    };

    this.driver = await remote({
      hostname: config.server.host,
      port: config.server.port,
      path: config.server.path,
      logLevel: config.logLevel as any,
      capabilities: capabilities as any,
    });

    // Wait for app to load
    await this.driver.pause(3000);
  }

  async cleanup(): Promise<void> {
    if (this.driver) {
      await this.driver.deleteSession();
    }
  }

  async sendMessage(contactName: string, message: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    // Click on contact
    const contact = await this.driver.$(
      `android=new UiSelector().text("${contactName}")`,
    );
    await contact.click();

    // Type message
    const messageInput = await this.driver.$(
      'android=new UiSelector().resourceId("message_input")',
    );
    await messageInput.setValue(message);

    // Send
    const sendButton = await this.driver.$(
      'android=new UiSelector().resourceId("send_button")',
    );
    await sendButton.click();
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error("Driver not initialized");

    try {
      const messageElement = await this.driver.$(
        `android=new UiSelector().textContains("${message}")`,
      );
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const addButton = await this.driver.$(
      'android=new UiSelector().resourceId("add_contact_button")',
    );
    await addButton.click();

    const nameInput = await this.driver.$(
      'android=new UiSelector().resourceId("contact_name_input")',
    );
    await nameInput.setValue(name);

    const keyInput = await this.driver.$(
      'android=new UiSelector().resourceId("contact_key_input")',
    );
    await keyInput.setValue(publicKey);

    const saveButton = await this.driver.$(
      'android=new UiSelector().resourceId("save_contact_button")',
    );
    await saveButton.click();
  }

  async getPeerCount(): Promise<number> {
    if (!this.driver) throw new Error("Driver not initialized");

    const peerCountElement = await this.driver.$(
      'android=new UiSelector().resourceId("peer_count")',
    );
    const text = await peerCountElement.getText();
    return parseInt(text || "0", 10);
  }

  async waitForPeerConnection(
    expectedCount: number,
    timeout = 10000,
  ): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const count = await this.getPeerCount();
      if (count >= expectedCount) return;
      await this.driver.pause(500);
    }
    throw new Error(`Timeout waiting for ${expectedCount} peer connections`);
  }

  async getPublicKey(): Promise<string> {
    if (!this.driver) throw new Error("Driver not initialized");

    // Navigate to settings
    const settingsButton = await this.driver.$(
      'android=new UiSelector().resourceId("settings_button")',
    );
    await settingsButton.click();

    // Get public key from identity section
    const publicKeyElement = await this.driver.$(
      'android=new UiSelector().resourceId("public_key_text")',
    );
    const publicKey = await publicKeyElement.getText();

    // Navigate back
    await this.driver.back();

    return publicKey;
  }

  async takeScreenshot(name: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    await this.driver.saveScreenshot(
      `screenshots/${this.platform}-${this.clientId}-${name}.png`,
    );
  }

  async goOffline(): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    // Toggle airplane mode
    await this.driver.execute("mobile: shell", {
      command: "cmd connectivity airplane-mode enable",
    });
  }

  async goOnline(): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    await this.driver.execute("mobile: shell", {
      command: "cmd connectivity airplane-mode disable",
    });
  }

  async sendMessageToGroup(message: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const messageInput = await this.driver.$(
      'android=new UiSelector().resourceId("group_message_input")',
    );
    await messageInput.setValue(message);

    const sendButton = await this.driver.$(
      'android=new UiSelector().resourceId("send_group_button")',
    );
    await sendButton.click();
  }

  async waitForGroupMessage(
    message: string,
    timeout = 10000,
  ): Promise<boolean> {
    if (!this.driver) throw new Error("Driver not initialized");

    try {
      const messageElement = await this.driver.$(
        `android=new UiSelector().resourceId("group_message").textContains("${message}")`,
      );
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * iOS client using Appium/WebDriverIO
 */
export class iOSClient extends PlatformClient {
  private driver?: WebdriverBrowser;

  constructor(clientId: string) {
    super(clientId, "ios");
  }

  async initialize(): Promise<void> {
    // Build W3C capabilities with nested appium:options
    const { platformName, ...appiumOpts } = config.ios;
    const capabilities = {
      platformName,
      "appium:options": {
        ...appiumOpts,
        deviceName: `${config.ios.deviceName}-${this.clientId}`,
      },
    };

    this.driver = await remote({
      hostname: config.server.host,
      port: config.server.port,
      path: config.server.path,
      logLevel: config.logLevel as any,
      capabilities,
    });

    // Wait for app to load
    await this.driver.pause(3000);
  }

  async cleanup(): Promise<void> {
    if (this.driver) {
      await this.driver.deleteSession();
    }
  }

  async sendMessage(contactName: string, message: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const contact = await this.driver.$(`~contact-${contactName}`);
    await contact.click();

    const messageInput = await this.driver.$("~message-input");
    await messageInput.setValue(message);

    const sendButton = await this.driver.$("~send-button");
    await sendButton.click();
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error("Driver not initialized");

    try {
      const messageElement = await this.driver.$(
        `-ios predicate string:label CONTAINS "${message}"`,
      );
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const addButton = await this.driver.$("~add-contact-button");
    await addButton.click();

    const nameInput = await this.driver.$("~contact-name-input");
    await nameInput.setValue(name);

    const keyInput = await this.driver.$("~contact-key-input");
    await keyInput.setValue(publicKey);

    const saveButton = await this.driver.$("~save-contact-button");
    await saveButton.click();
  }

  async getPeerCount(): Promise<number> {
    if (!this.driver) throw new Error("Driver not initialized");

    const peerCountElement = await this.driver.$("~peer-count");
    const text = await peerCountElement.getText();
    return parseInt(text || "0", 10);
  }

  async waitForPeerConnection(
    expectedCount: number,
    timeout = 10000,
  ): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const count = await this.getPeerCount();
      if (count >= expectedCount) return;
      await this.driver.pause(500);
    }
    throw new Error(`Timeout waiting for ${expectedCount} peer connections`);
  }

  async getPublicKey(): Promise<string> {
    if (!this.driver) throw new Error("Driver not initialized");

    const settingsButton = await this.driver.$("~settings-button");
    await settingsButton.click();

    const publicKeyElement = await this.driver.$("~public-key-text");
    const publicKey = await publicKeyElement.getText();

    await this.driver.back();

    return publicKey;
  }

  async takeScreenshot(name: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    await this.driver.saveScreenshot(
      `screenshots/${this.platform}-${this.clientId}-${name}.png`,
    );
  }

  async goOffline(): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    // iOS doesn't allow programmatic control of airplane mode in simulator
    // This is a limitation of iOS testing
    console.warn("iOS offline mode not supported in simulator");
  }

  async goOnline(): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");
    console.warn("iOS online mode not supported in simulator");
  }

  async sendMessageToGroup(message: string): Promise<void> {
    if (!this.driver) throw new Error("Driver not initialized");

    const messageInput = await this.driver.$("~group-message-input");
    await messageInput.setValue(message);

    const sendButton = await this.driver.$("~send-group-button");
    await sendButton.click();
  }

  async waitForGroupMessage(
    message: string,
    timeout = 10000,
  ): Promise<boolean> {
    if (!this.driver) throw new Error("Driver not initialized");

    try {
      const messageElement = await this.driver.$(
        `-ios predicate string:name == "group-message" AND label CONTAINS "${message}"`,
      );
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Test coordinator for managing multiple clients
 */
export class CrossPlatformTestCoordinator {
  private clients: Map<string, PlatformClient> = new Map();
  private clientCounter = 0;

  /**
   * Create a new client instance
   */
  async createClient(
    options: ClientOptions,
    page?: Page,
    browser?: Browser,
  ): Promise<PlatformClient> {
    const clientId = options.name || `client-${++this.clientCounter}`;
    let client: PlatformClient;

    switch (options.platform) {
      case "web":
        if (!page || !browser) {
          throw new Error("Page and browser required for web client");
        }
        client = new WebClient(clientId, page, browser);
        break;
      case "android":
        client = new AndroidClient(clientId);
        break;
      case "ios":
        client = new iOSClient(clientId);
        break;
      default:
        throw new Error(`Unsupported platform: ${options.platform}`);
    }

    await client.initialize();
    this.clients.set(clientId, client);
    return client;
  }

  /**
   * Get a client by ID
   */
  getClient(clientId: string): PlatformClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): PlatformClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Exchange contact information between two clients
   */
  async connectClients(
    client1: PlatformClient,
    client2: PlatformClient,
  ): Promise<void> {
    const peerId1 = await client1.getPeerId();
    const peerId2 = await client2.getPeerId();

    if (!peerId1 || !peerId2) {
      throw new Error(
        `Missing peer IDs for connectClients: peerId1=${peerId1 || "(empty)"}, peerId2=${peerId2 || "(empty)"}`,
      );
    }

    await client1.addContact(client2.getId(), peerId2);
    await client2.addContact(client1.getId(), peerId1);

    // Join the same signaling room so WebRTC can exchange offers/candidates
    const ROOM_URL = "https://sovcom.netlify.app/.netlify/functions/room";
    await Promise.all([client1.joinRoom(ROOM_URL), client2.joinRoom(ROOM_URL)]);

    // Wait for discovery before initiating the connection
    await Promise.all([
      client1.waitForDiscoveredPeer(peerId2, 60000),
      client2.waitForDiscoveredPeer(peerId1, 60000),
    ]);

    // Deterministically initiate connection to avoid glare
    await client1.connectToPeer(peerId2);

    // Give the initiator a moment to enqueue offers/candidates
    await new Promise((r) => setTimeout(r, 1000));

    // If connection isn't showing up quickly, try initiating from the other side too.
    // (Some environments require the remote to also actively initiate.)
    const fastConnect = await Promise.race([
      client1.waitForPeer(peerId2, 15000).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15000)),
    ]);

    if (!fastConnect) {
      await client2.connectToPeer(peerId1);
    }

    // Wait until the two clients see each other as connected peers
    await Promise.all([
      client1.waitForPeer(peerId2, 60000),
      client2.waitForPeer(peerId1, 60000),
    ]);
  }

  /**
   * Create a group with multiple clients
   */
  async createGroup(clients: PlatformClient[]): Promise<void> {
    // Connect all clients to each other
    for (let i = 0; i < clients.length; i++) {
      for (let j = i + 1; j < clients.length; j++) {
        await this.connectClients(clients[i], clients[j]);
      }
    }
    // Wait for mesh network to establish
    await this.waitForMeshNetwork(clients.length - 1, 30000);
  }

  /**
   * Wait for all clients to establish peer connections
   */
  async waitForMeshNetwork(
    expectedPeerCount = 1,
    timeout = 30000,
  ): Promise<void> {
    const promises = this.getAllClients().map((client) =>
      client.waitForPeerConnection(expectedPeerCount, timeout),
    );
    await Promise.all(promises);
  }

  /**
   * Send a message from one client to another and verify receipt
   */
  async sendAndVerifyMessage(
    sender: PlatformClient,
    receiver: PlatformClient,
    message: string,
    timeout = 10000,
  ): Promise<boolean> {
    // Ensure receiver is looking at the right conversation thread
    await receiver.openConversation(sender.getId());
    // Ensure sender is also in the right thread for UI-driven send
    await sender.openConversation(receiver.getId());
    await sender.sendMessage(receiver.getId(), message);
    const received = await receiver.waitForMessage(message, timeout);

    if (!received) {
      const [senderSnap, receiverSnap] = await Promise.all([
        sender.getDebugSnapshot().catch((e) => ({ error: String(e) })),
        receiver.getDebugSnapshot().catch((e) => ({ error: String(e) })),
      ]);
      // eslint-disable-next-line no-console
      console.log(
        `[CrossPlatformTestCoordinator] Message not received within ${timeout}ms. Message="${message}"\nSender snapshot: ${JSON.stringify(senderSnap)}\nReceiver snapshot: ${JSON.stringify(receiverSnap)}`,
      );
    }

    return received;
  }

  /**
   * Take screenshots of all clients
   */
  async takeScreenshotAll(name: string): Promise<void> {
    const promises = this.getAllClients().map((client) =>
      client.takeScreenshot(name),
    );
    await Promise.all(promises);
  }

  /**
   * Cleanup all clients
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.clients.values()).map((client) =>
      client.cleanup(),
    );
    await Promise.all(promises);
    this.clients.clear();
    this.clientCounter = 0;
  }
}

/**
 * Utility to wait for a condition with timeout
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 10000,
  interval = 500,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timeout waiting for condition");
}

/**
 * Alias for iOS client (backwards compatibility)
 */
export const IOSClient = iOSClient;
