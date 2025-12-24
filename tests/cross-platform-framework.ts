/**
 * Cross-Platform E2E Test Framework
 * Coordinates testing across Web, Android, and iOS platforms
 */

import { Page, Browser } from '@playwright/test';
import { remote, RemoteOptions, Browser as WebdriverBrowser } from 'webdriverio';
import { config } from '../appium.config';

export type Platform = 'web' | 'android' | 'ios';

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
  abstract waitForPeerConnection(expectedCount: number, timeout?: number): Promise<void>;
  abstract getPublicKey(): Promise<string>;
  abstract takeScreenshot(name: string): Promise<void>;
  abstract goOffline(): Promise<void>;
  abstract goOnline(): Promise<void>;
  
  // Group messaging methods (with default implementations that can be overridden)
  async sendMessageToGroup(message: string): Promise<void> {
    throw new Error('sendMessageToGroup not implemented for this platform');
  }
  
  async waitForGroupMessage(message: string, timeout?: number): Promise<boolean> {
    throw new Error('waitForGroupMessage not implemented for this platform');
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

  constructor(clientId: string, page: Page, browser: Browser) {
    super(clientId, 'web');
    this.page = page;
    this.browser = browser;
  }

  async initialize(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async cleanup(): Promise<void> {
    await this.page.close();
  }

  async sendMessage(contactName: string, message: string): Promise<void> {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    await this.page.fill('[data-testid="message-input"]', message);
    await this.page.click('[data-testid="send-message-btn"]');
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    try {
      await this.page.waitForSelector(`text=${message}`, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    await this.page.click('[data-testid="add-contact-btn"]');
    await this.page.fill('[data-testid="contact-name-input"]', name);
    await this.page.fill('[data-testid="contact-publickey-input"]', publicKey);
    await this.page.click('[data-testid="save-contact-btn"]');
    await this.page.waitForSelector(`[data-testid="contact-${name}"]`);
  }

  async getPeerCount(): Promise<number> {
    const peerCountText = await this.page.textContent('[data-testid="peer-count"]');
    return parseInt(peerCountText || '0', 10);
  }

  async waitForPeerConnection(expectedCount: number, timeout = 10000): Promise<void> {
    await this.page.waitForFunction(
      (count) => {
        const elem = document.querySelector('[data-testid="peer-count"]');
        return elem && parseInt(elem.textContent || '0', 10) >= count;
      },
      expectedCount,
      { timeout }
    );
  }

  async getPublicKey(): Promise<string> {
    return await this.page.evaluate(() => {
      const identity = JSON.parse(localStorage.getItem('identity') || '{}');
      return identity.publicKey || '';
    });
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `screenshots/${this.platform}-${this.clientId}-${name}.png`, 
      fullPage: true 
    });
  }

  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false);
  }

  async sendMessageToGroup(message: string): Promise<void> {
    await this.page.fill('[data-testid="group-message-input"]', message);
    await this.page.click('[data-testid="send-group-message-btn"]');
  }

  async waitForGroupMessage(message: string, timeout = 10000): Promise<boolean> {
    try {
      await this.page.waitForSelector(`[data-testid="group-message"]:has-text("${message}")`, { timeout });
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
    super(clientId, 'android');
  }

  async initialize(): Promise<void> {
    // Separate W3C and Appium-specific capabilities
    const w3cCaps: Record<string, any> = {};
    const appiumCaps: Record<string, any> = {};
    for (const [key, value] of Object.entries(config.android)) {
      // Only allow W3C top-level keys
      if (key === 'platformName' || key === 'browserName') {
        w3cCaps[key] = value;
      } else {
        appiumCaps[key] = value;
      }
    }
    // Override deviceName for parallelization
    appiumCaps.deviceName = `${config.android.deviceName}-${this.clientId}`;
    const capabilities: RemoteOptions['capabilities'] = {
      ...w3cCaps,
      'appium:options': appiumCaps,
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
    if (!this.driver) throw new Error('Driver not initialized');
    
    // Click on contact
    const contact = await this.driver.$(`android=new UiSelector().text("${contactName}")`);
    await contact.click();
    
    // Type message
    const messageInput = await this.driver.$('android=new UiSelector().resourceId("message_input")');
    await messageInput.setValue(message);
    
    // Send
    const sendButton = await this.driver.$('android=new UiSelector().resourceId("send_button")');
    await sendButton.click();
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    try {
      const messageElement = await this.driver.$(`android=new UiSelector().textContains("${message}")`);
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const addButton = await this.driver.$('android=new UiSelector().resourceId("add_contact_button")');
    await addButton.click();
    
    const nameInput = await this.driver.$('android=new UiSelector().resourceId("contact_name_input")');
    await nameInput.setValue(name);
    
    const keyInput = await this.driver.$('android=new UiSelector().resourceId("contact_key_input")');
    await keyInput.setValue(publicKey);
    
    const saveButton = await this.driver.$('android=new UiSelector().resourceId("save_contact_button")');
    await saveButton.click();
  }

  async getPeerCount(): Promise<number> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const peerCountElement = await this.driver.$('android=new UiSelector().resourceId("peer_count")');
    const text = await peerCountElement.getText();
    return parseInt(text || '0', 10);
  }

  async waitForPeerConnection(expectedCount: number, timeout = 10000): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const count = await this.getPeerCount();
      if (count >= expectedCount) return;
      await this.driver.pause(500);
    }
    throw new Error(`Timeout waiting for ${expectedCount} peer connections`);
  }

  async getPublicKey(): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    // Navigate to settings
    const settingsButton = await this.driver.$('android=new UiSelector().resourceId("settings_button")');
    await settingsButton.click();
    
    // Get public key from identity section
    const publicKeyElement = await this.driver.$('android=new UiSelector().resourceId("public_key_text")');
    const publicKey = await publicKeyElement.getText();
    
    // Navigate back
    await this.driver.back();
    
    return publicKey;
  }

  async takeScreenshot(name: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    await this.driver.saveScreenshot(`screenshots/${this.platform}-${this.clientId}-${name}.png`);
  }

  async goOffline(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    // Toggle airplane mode
    await this.driver.execute('mobile: shell', {
      command: 'cmd connectivity airplane-mode enable',
    });
  }

  async goOnline(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    await this.driver.execute('mobile: shell', {
      command: 'cmd connectivity airplane-mode disable',
    });
  }

  async sendMessageToGroup(message: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const messageInput = await this.driver.$('android=new UiSelector().resourceId("group_message_input")');
    await messageInput.setValue(message);
    
    const sendButton = await this.driver.$('android=new UiSelector().resourceId("send_group_button")');
    await sendButton.click();
  }

  async waitForGroupMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    try {
      const messageElement = await this.driver.$(`android=new UiSelector().resourceId("group_message").textContains("${message}")`);
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
    super(clientId, 'ios');
  }

  async initialize(): Promise<void> {
    // Separate W3C and Appium-specific capabilities
    const w3cCaps: Record<string, any> = {};
    const appiumCaps: Record<string, any> = {};
    for (const [key, value] of Object.entries(config.ios)) {
      // Only allow W3C top-level keys
      if (key === 'platformName' || key === 'browserName') {
        w3cCaps[key] = value;
      } else {
        appiumCaps[key] = value;
      }
    }
    // Override deviceName for parallelization
    appiumCaps.deviceName = `${config.ios.deviceName}-${this.clientId}`;
    const capabilities: RemoteOptions['capabilities'] = {
      ...w3cCaps,
      'appium:options': appiumCaps,
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
    if (!this.driver) throw new Error('Driver not initialized');
    
    const contact = await this.driver.$(`~contact-${contactName}`);
    await contact.click();
    
    const messageInput = await this.driver.$('~message-input');
    await messageInput.setValue(message);
    
    const sendButton = await this.driver.$('~send-button');
    await sendButton.click();
  }

  async waitForMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    try {
      const messageElement = await this.driver.$(`-ios predicate string:label CONTAINS "${message}"`);
      await messageElement.waitForExist({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async addContact(name: string, publicKey: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const addButton = await this.driver.$('~add-contact-button');
    await addButton.click();
    
    const nameInput = await this.driver.$('~contact-name-input');
    await nameInput.setValue(name);
    
    const keyInput = await this.driver.$('~contact-key-input');
    await keyInput.setValue(publicKey);
    
    const saveButton = await this.driver.$('~save-contact-button');
    await saveButton.click();
  }

  async getPeerCount(): Promise<number> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const peerCountElement = await this.driver.$('~peer-count');
    const text = await peerCountElement.getText();
    return parseInt(text || '0', 10);
  }

  async waitForPeerConnection(expectedCount: number, timeout = 10000): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const count = await this.getPeerCount();
      if (count >= expectedCount) return;
      await this.driver.pause(500);
    }
    throw new Error(`Timeout waiting for ${expectedCount} peer connections`);
  }

  async getPublicKey(): Promise<string> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const settingsButton = await this.driver.$('~settings-button');
    await settingsButton.click();
    
    const publicKeyElement = await this.driver.$('~public-key-text');
    const publicKey = await publicKeyElement.getText();
    
    await this.driver.back();
    
    return publicKey;
  }

  async takeScreenshot(name: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    await this.driver.saveScreenshot(`screenshots/${this.platform}-${this.clientId}-${name}.png`);
  }

  async goOffline(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    // iOS doesn't allow programmatic control of airplane mode in simulator
    // This is a limitation of iOS testing
    console.warn('iOS offline mode not supported in simulator');
  }

  async goOnline(): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    console.warn('iOS online mode not supported in simulator');
  }

  async sendMessageToGroup(message: string): Promise<void> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    const messageInput = await this.driver.$('~group-message-input');
    await messageInput.setValue(message);
    
    const sendButton = await this.driver.$('~send-group-button');
    await sendButton.click();
  }

  async waitForGroupMessage(message: string, timeout = 10000): Promise<boolean> {
    if (!this.driver) throw new Error('Driver not initialized');
    
    try {
      const messageElement = await this.driver.$(`-ios predicate string:name == "group-message" AND label CONTAINS "${message}"`);
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
  async createClient(options: ClientOptions, page?: Page, browser?: Browser): Promise<PlatformClient> {
    const clientId = options.name || `client-${++this.clientCounter}`;
    let client: PlatformClient;

    switch (options.platform) {
      case 'web':
        if (!page || !browser) {
          throw new Error('Page and browser required for web client');
        }
        client = new WebClient(clientId, page, browser);
        break;
      case 'android':
        client = new AndroidClient(clientId);
        break;
      case 'ios':
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
  async connectClients(client1: PlatformClient, client2: PlatformClient): Promise<void> {
    const publicKey1 = await client1.getPublicKey();
    const publicKey2 = await client2.getPublicKey();

    await client1.addContact(client2.getId(), publicKey2);
    await client2.addContact(client1.getId(), publicKey1);
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
  async waitForMeshNetwork(expectedPeerCount = 1, timeout = 30000): Promise<void> {
    const promises = this.getAllClients().map(client =>
      client.waitForPeerConnection(expectedPeerCount, timeout)
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
    timeout = 10000
  ): Promise<boolean> {
    await sender.sendMessage(receiver.getId(), message);
    return await receiver.waitForMessage(message, timeout);
  }

  /**
   * Take screenshots of all clients
   */
  async takeScreenshotAll(name: string): Promise<void> {
    const promises = this.getAllClients().map(client =>
      client.takeScreenshot(name)
    );
    await Promise.all(promises);
  }

  /**
   * Cleanup all clients
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.clients.values()).map(client =>
      client.cleanup()
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
  interval = 500
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Alias for iOS client (backwards compatibility)
 */
export const IOSClient = iOSClient;
