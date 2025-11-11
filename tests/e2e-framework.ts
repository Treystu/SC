import { test as base, expect, Page } from '@playwright/test';

export const test = base.extend({
  // Add custom fixtures here
});

export { expect };

export class E2ETestFramework {
  constructor(private page: Page) {}

  async navigateToApp() {
    await this.page.goto('http://localhost:5173');
    await this.page.waitForLoadState('networkidle');
  }

  async createNewContact(name: string, publicKey: string) {
    await this.page.click('[data-testid="add-contact-btn"]');
    await this.page.fill('[data-testid="contact-name-input"]', name);
    await this.page.fill('[data-testid="contact-publickey-input"]', publicKey);
    await this.page.click('[data-testid="save-contact-btn"]');
    await this.page.waitForSelector(`[data-testid="contact-${name}"]`);
  }

  async sendMessage(contactName: string, message: string) {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    await this.page.fill('[data-testid="message-input"]', message);
    await this.page.click('[data-testid="send-message-btn"]');
  }

  async waitForMessageReceived(message: string) {
    await this.page.waitForSelector(`text=${message}`, { timeout: 10000 });
  }

  async sendFile(contactName: string, filePath: string) {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    const fileInput = await this.page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(filePath);
    await this.page.click('[data-testid="send-file-btn"]');
  }

  async waitForFileTransferComplete(fileName: string) {
    await this.page.waitForSelector(
      `[data-testid="file-${fileName}"][data-status="complete"]`,
      { timeout: 30000 }
    );
  }

  async startVoiceCall(contactName: string) {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    await this.page.click('[data-testid="voice-call-btn"]');
    await this.page.waitForSelector('[data-testid="call-active"]');
  }

  async endVoiceCall() {
    await this.page.click('[data-testid="end-call-btn"]');
    await this.page.waitForSelector('[data-testid="call-ended"]');
  }

  async enableOfflineMode() {
    await this.page.context().setOffline(true);
  }

  async disableOfflineMode() {
    await this.page.context().setOffline(false);
  }

  async getMessageCount(): Promise<number> {
    const messages = await this.page.locator('[data-testid^="message-"]').count();
    return messages;
  }

  async getPeerCount(): Promise<number> {
    const peerCountText = await this.page.textContent('[data-testid="peer-count"]');
    return parseInt(peerCountText || '0', 10);
  }

  async waitForPeerConnection(expectedCount: number) {
    await this.page.waitForFunction(
      (count) => {
        const elem = document.querySelector('[data-testid="peer-count"]');
        return elem && parseInt(elem.textContent || '0', 10) >= count;
      },
      expectedCount,
      { timeout: 10000 }
    );
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  async recordVideo(name: string, duration: number) {
    // Playwright automatically records video when configured
    await this.page.waitForTimeout(duration);
  }

  async clearLocalStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }

  async clearIndexedDB() {
    await this.page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const dbs = indexedDB.databases();
        dbs.then((databases) => {
          databases.forEach((db) => {
            if (db.name) indexedDB.deleteDatabase(db.name);
          });
          resolve();
        });
      });
    });
  }

  async getConsoleLogs(): Promise<string[]> {
    return this.page.evaluate(() => {
      return (window as any).__consoleLogs || [];
    });
  }

  async getNetworkRequests(): Promise<any[]> {
    return this.page.evaluate(() => {
      return (window as any).__networkRequests || [];
    });
  }

  async measurePerformance(): Promise<{
    loadTime: number;
    domContentLoaded: number;
    firstPaint: number;
  }> {
    return this.page.evaluate(() => {
      const perfData = performance.timing;
      return {
        loadTime: perfData.loadEventEnd - perfData.navigationStart,
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.navigationStart,
        firstPaint: perfData.responseStart - perfData.navigationStart,
      };
    });
  }

  async simulateSlowNetwork() {
    await this.page.context().route('**/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    });
  }

  async simulateNetworkFailure() {
    await this.page.context().route('**/*', (route) => route.abort());
  }

  async restoreNetwork() {
    await this.page.context().unroute('**/*');
  }
}

// Example E2E test using the framework
test.describe('Sovereign Communications E2E Tests', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should send and receive messages', async () => {
    await framework.createNewContact('Alice', 'public-key-alice');
    await framework.sendMessage('Alice', 'Hello Alice!');
    await framework.waitForMessageReceived('Hello Alice!');
    
    const messageCount = await framework.getMessageCount();
    expect(messageCount).toBeGreaterThan(0);
  });

  test('should transfer files between peers', async () => {
    await framework.createNewContact('Bob', 'public-key-bob');
    await framework.sendFile('Bob', 'test-file.txt');
    await framework.waitForFileTransferComplete('test-file.txt');
  });

  test('should handle offline/online transitions', async () => {
    await framework.createNewContact('Charlie', 'public-key-charlie');
    
    await framework.enableOfflineMode();
    await framework.sendMessage('Charlie', 'Offline message');
    
    await framework.disableOfflineMode();
    await framework.waitForMessageReceived('Offline message');
  });

  test('should maintain peer connections', async () => {
    await framework.waitForPeerConnection(1);
    const peerCount = await framework.getPeerCount();
    expect(peerCount).toBeGreaterThanOrEqual(1);
  });

  test('should measure performance', async () => {
    const perf = await framework.measurePerformance();
    expect(perf.loadTime).toBeLessThan(3000);
    expect(perf.domContentLoaded).toBeLessThan(2000);
  });
});
