/**
 * End-to-End Tests for Sovereign Communications
 * 
 * Tests complete user flows across the application
 */

import { test, expect, Page } from '@playwright/test';
import { E2ETestFramework } from './e2e-framework';

test.describe('User Authentication and Setup', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should generate new identity on first launch', async ({ page }) => {
    // Check for identity setup UI
    await expect(page.locator('[data-testid="identity-setup"]')).toBeVisible();
    
    // Generate new identity
    await page.click('[data-testid="generate-identity-btn"]');
    
    // Wait for identity to be created
    await page.waitForSelector('[data-testid="public-key-display"]');
    
    // Verify public key is displayed
    const publicKey = await page.textContent('[data-testid="public-key-display"]');
    expect(publicKey).toBeTruthy();
    expect(publicKey?.length).toBeGreaterThan(32);
  });

  test('should display identity fingerprint', async ({ page }) => {
    await page.click('[data-testid="generate-identity-btn"]');
    await page.waitForSelector('[data-testid="fingerprint-display"]');
    
    const fingerprint = await page.textContent('[data-testid="fingerprint-display"]');
    expect(fingerprint).toBeTruthy();
  });

  test('should save identity to local storage', async ({ page }) => {
    await page.click('[data-testid="generate-identity-btn"]');
    await page.waitForSelector('[data-testid="public-key-display"]');
    
    // Reload page
    await page.reload();
    
    // Identity should persist
    await expect(page.locator('[data-testid="public-key-display"]')).toBeVisible();
  });
});

test.describe('Peer Discovery and Connection', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
    
    // Ensure identity exists
    const hasIdentity = await page.locator('[data-testid="public-key-display"]').isVisible();
    if (!hasIdentity) {
      await page.click('[data-testid="generate-identity-btn"]');
      await page.waitForSelector('[data-testid="public-key-display"]');
    }
  });

  test('should add peer via QR code', async ({ page }) => {
    await page.click('[data-testid="add-peer-btn"]');
    await page.click('[data-testid="qr-method-tab"]');
    
    // Show QR code
    await expect(page.locator('[data-testid="qr-code-display"]')).toBeVisible();
    
    // Scan QR code (simulated)
    const mockPeerData = {
      publicKey: '0'.repeat(64),
      name: 'Test Peer'
    };
    
    await page.evaluate((data) => {
      window.dispatchEvent(new CustomEvent('qr-scanned', { detail: data }));
    }, mockPeerData);
    
    // Verify peer added
    await expect(page.locator('[data-testid="peer-Test Peer"]')).toBeVisible();
  });

  test('should show peer connection status', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    // Check connection status indicator
    const status = await page.locator('[data-testid="peer-Alice-status"]');
    await expect(status).toBeVisible();
  });

  test('should handle multiple peer connections', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.createNewContact('Bob', '2'.repeat(64));
    await framework.createNewContact('Charlie', '3'.repeat(64));
    
    // Verify all peers are listed
    await expect(page.locator('[data-testid="peer-Alice"]')).toBeVisible();
    await expect(page.locator('[data-testid="peer-Bob"]')).toBeVisible();
    await expect(page.locator('[data-testid="peer-Charlie"]')).toBeVisible();
    
    // Check peer count
    const peerCount = await framework.getPeerCount();
    expect(peerCount).toBeGreaterThanOrEqual(3);
  });
});

test.describe('Messaging Functionality', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
    await framework.clearIndexedDB();
  });

  test('should send and display text message', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.sendMessage('Alice', 'Hello, Alice!');
    
    // Verify message appears in conversation
    await expect(page.locator('text=Hello, Alice!')).toBeVisible();
    
    // Verify message status
    await expect(page.locator('[data-testid*="message"][data-status="sent"]')).toBeVisible();
  });

  test('should handle long messages', async ({ page }) => {
    await framework.createNewContact('Bob', '2'.repeat(64));
    
    const longMessage = 'A'.repeat(5000);
    await framework.sendMessage('Bob', longMessage);
    
    await expect(page.locator(`text=${longMessage.substring(0, 100)}`)).toBeVisible();
  });

  test('should display message timestamps', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.sendMessage('Alice', 'Test message');
    
    const timestamp = await page.locator('[data-testid*="message-timestamp"]').first();
    await expect(timestamp).toBeVisible();
  });

  test('should support emoji in messages', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.sendMessage('Alice', 'Hello 👋 😊');
    
    await expect(page.locator('text=Hello 👋 😊')).toBeVisible();
  });

  test('should maintain conversation history', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    await framework.sendMessage('Alice', 'Message 1');
    await framework.sendMessage('Alice', 'Message 2');
    await framework.sendMessage('Alice', 'Message 3');
    
    const messageCount = await framework.getMessageCount();
    expect(messageCount).toBeGreaterThanOrEqual(3);
  });
});

test.describe('File Transfer', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should send file to peer', async ({ page }) => {
    await framework.createNewContact('Bob', '2'.repeat(64));
    
    // Create a test file
    const testFilePath = '/tmp/test-file.txt';
    await page.evaluate(async () => {
      const content = 'Test file content';
      const blob = new Blob([content], { type: 'text/plain' });
      const file = new File([blob], 'test-file.txt');
      
      // Simulate file selection
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      const fileInput = document.querySelector('[data-testid="file-input"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await page.click('[data-testid="send-file-btn"]');
    
    // Verify file transfer initiated
    await expect(page.locator('[data-testid*="file-transfer"]')).toBeVisible();
  });

  test('should show file transfer progress', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    // Send a file
    await page.evaluate(async () => {
      const content = new Uint8Array(1024 * 100); // 100KB
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const file = new File([blob], 'large-file.bin');
      
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      const fileInput = document.querySelector('[data-testid="file-input"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.files = dataTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    await page.click('[data-testid="send-file-btn"]');
    
    // Check for progress indicator
    const progress = page.locator('[data-testid*="transfer-progress"]');
    await expect(progress).toBeVisible();
  });
});

test.describe('Offline Functionality', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should queue messages when offline', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    // Go offline
    await framework.enableOfflineMode();
    
    // Send message while offline
    await framework.sendMessage('Alice', 'Offline message');
    
    // Message should be queued
    await expect(page.locator('[data-testid*="message"][data-status="queued"]')).toBeVisible();
    
    // Go back online
    await framework.disableOfflineMode();
    
    // Message should be sent
    await page.waitForSelector('[data-testid*="message"][data-status="sent"]', { timeout: 5000 });
  });

  test('should persist data while offline', async ({ page }) => {
    await framework.createNewContact('Bob', '2'.repeat(64));
    await framework.sendMessage('Bob', 'Test message');
    
    // Go offline
    await framework.enableOfflineMode();
    
    // Reload page
    await page.reload();
    
    // Data should persist
    await expect(page.locator('text=Test message')).toBeVisible();
  });
});

test.describe('Performance', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
  });

  test('should load app within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await framework.navigateToApp();
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000); // 3 seconds
  });

  test('should handle 100 messages efficiently', async ({ page }) => {
    await framework.navigateToApp();
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    const startTime = Date.now();
    
    for (let i = 0; i < 100; i++) {
      await page.fill('[data-testid="message-input"]', `Message ${i}`);
      await page.click('[data-testid="send-message-btn"]');
    }
    
    const duration = Date.now() - startTime;
    
    // Should complete in reasonable time
    expect(duration).toBeLessThan(30000); // 30 seconds
  });

  test('should maintain smooth UI with many peers', async ({ page }) => {
    await framework.navigateToApp();
    
    // Add 50 peers
    for (let i = 0; i < 50; i++) {
      await framework.createNewContact(`Peer${i}`, i.toString().repeat(64).substring(0, 64));
    }
    
    // UI should remain responsive
    const scrollTime = await page.evaluate(() => {
      const start = performance.now();
      const list = document.querySelector('[data-testid="peer-list"]');
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
      return performance.now() - start;
    });
    
    expect(scrollTime).toBeLessThan(100); // Smooth scrolling
  });
});

test.describe('Security', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should not expose private keys in DOM', async ({ page }) => {
    await page.click('[data-testid="generate-identity-btn"]');
    await page.waitForSelector('[data-testid="public-key-display"]');
    
    // Check that private key is not in page content
    const content = await page.content();
    expect(content).not.toContain('privateKey');
    expect(content).not.toContain('private-key');
  });

  test('should encrypt messages before sending', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    
    // Intercept network requests
    const messages: any[] = [];
    page.on('request', request => {
      if (request.method() === 'POST') {
        messages.push(request.postData());
      }
    });
    
    await framework.sendMessage('Alice', 'Secret message');
    
    // Wait for request
    await page.waitForTimeout(1000);
    
    // Message content should not be in plaintext
    const plaintext = messages.some(msg => msg?.includes('Secret message'));
    expect(plaintext).toBe(false);
  });

  test('should verify peer identities', async ({ page }) => {
    await framework.createNewContact('Bob', '2'.repeat(64));
    
    // Check for verification status
    const verificationBadge = page.locator('[data-testid="peer-Bob-verified"]');
    await expect(verificationBadge).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
  });

  test('should be keyboard navigable', async ({ page }) => {
    // Tab through interface
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    
    // Check that focus is visible
    const focused = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });
    
    expect(focused).toBeTruthy();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    const sendButton = page.locator('[data-testid="send-message-btn"]');
    const ariaLabel = await sendButton.getAttribute('aria-label');
    
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('send');
  });

  test('should support screen readers', async ({ page }) => {
    // Check for proper semantic HTML
    const main = await page.locator('main').count();
    const nav = await page.locator('nav').count();
    
    expect(main).toBeGreaterThan(0);
    expect(nav).toBeGreaterThan(0);
  });
});
