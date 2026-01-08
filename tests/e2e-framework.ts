import { test as base, expect, Page } from '@playwright/test';

export const test = base.extend({
  // Add custom fixtures here
});

export { expect };

export class E2ETestFramework {
  constructor(private page: Page) { }

  async navigateToApp() {
    await this.page.goto('http://localhost:3001');
    await this.page.waitForLoadState('networkidle');
    // Wait for app to be fully initialized
    await this.page.waitForSelector('[data-testid="local-peer-id"]', { timeout: 15000 });
  }

  async createNewContact(name: string, publicKey: string) {
    // First, ensure the add menu is open
    await this.page.click('[data-testid="add-contact-btn"]');
    
    // Wait for menu to appear
    await this.page.waitForTimeout(300);

    const isDemoContact = name.toLowerCase() === 'demo' && publicKey.toLowerCase() === 'demo';
    if (isDemoContact) {
      const quickAdd = this.page.locator('[data-testid="quick-add-btn"]');
      if (await quickAdd.isVisible({ timeout: 2000 })) {
        await quickAdd.click();
        await this.page.waitForTimeout(500);
        return;
      }
    }

    const addByIdBtn = this.page.locator('[data-testid="add-by-id-btn"]');
    await addByIdBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addByIdBtn.click();
    await this.page.waitForTimeout(300);

    await this.page.fill('[data-testid="contact-name-input"]', name);
    await this.page.fill('[data-testid="contact-publickey-input"]', publicKey);
    await this.page.click('[data-testid="save-contact-btn"]');
    
    // Wait for conversation to appear in the list
    await this.page.waitForSelector(`[data-testid="contact-${name}"]`, { timeout: 10000 });
  }

  async sendMessage(contactName: string, message: string) {
    const actualContactName = contactName.toLowerCase() === 'demo' ? 'Test Peer' : contactName;
    
    await this.page.click(`[data-testid="contact-${actualContactName}"]`);
    await this.page.waitForSelector('[data-testid="chat-container"]', { timeout: 5000 });
    await this.page.waitForTimeout(300);
    
    await this.page.fill('[data-testid="message-input"]', message);
    await this.page.click('[data-testid="send-message-btn"]');
    await this.page.waitForTimeout(500);
  }

  async waitForMessageReceived(message: string) {
    await this.page.waitForSelector(`text=${message}`, { timeout: 10000 });
  }

  async sendFile(contactName: string, filePath: string) {
    await this.page.click(`[data-testid="contact-${contactName}"]`);
    const fileInput = await this.page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(filePath);
    await this.page.click('[data-testid="send-message-btn"]');
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

