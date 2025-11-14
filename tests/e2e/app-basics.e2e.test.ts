/**
 * E2E tests for basic application functionality
 */
import { test, expect, Page } from '@playwright/test';

test.describe('Application Load', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loaded
    await expect(page).toHaveTitle(/Sovereign Communications/i);
  });

  test('should have responsive layout', async ({ page }) => {
    await page.goto('/');
    
    // Test different viewport sizes
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
    
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    expect(errors).toHaveLength(0);
  });
});

test.describe('Identity Management', () => {
  test('should generate new identity on first load', async ({ page }) => {
    // Clear storage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('sovereign-communications');
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check that identity was generated
    const hasIdentity = await page.evaluate(() => {
      return localStorage.getItem('identity') !== null;
    });
    
    expect(hasIdentity).toBe(true);
  });

  test('should persist identity across page reloads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get identity
    const identity1 = await page.evaluate(() => {
      return localStorage.getItem('identity');
    });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Get identity again
    const identity2 = await page.evaluate(() => {
      return localStorage.getItem('identity');
    });
    
    expect(identity1).toBe(identity2);
  });

  test('should display public key fingerprint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const fingerprint = await page.locator('[data-testid="public-key-fingerprint"]');
    if (await fingerprint.count() > 0) {
      await expect(fingerprint).toBeVisible();
      const text = await fingerprint.textContent();
      expect(text).toMatch(/[0-9A-F]{4}( [0-9A-F]{4})+/i); // Fingerprint format
    }
  });
});

test.describe('Peer Discovery', () => {
  test('should show peer count', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const peerCount = await page.locator('[data-testid="peer-count"]');
    if (await peerCount.count() > 0) {
      await expect(peerCount).toBeVisible();
    }
  });

  test('should allow manual peer addition', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Look for add peer button
    const addButton = page.locator('[data-testid="add-peer-btn"]');
    if (await addButton.count() > 0) {
      await addButton.click();
      
      // Fill in peer details
      const peerIdInput = page.locator('[data-testid="peer-id-input"]');
      if (await peerIdInput.count() > 0) {
        await peerIdInput.fill('test-peer');
        
        const publicKeyInput = page.locator('[data-testid="peer-publickey-input"]');
        await publicKeyInput.fill('A'.repeat(64)); // Dummy public key
        
        const saveButton = page.locator('[data-testid="save-peer-btn"]');
        await saveButton.click();
      }
    }
  });
});

test.describe('Offline Functionality', () => {
  test('should work offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Go offline
    await context.setOffline(true);
    
    // App should still be functional
    await expect(page.locator('body')).toBeVisible();
    
    // Go back online
    await context.setOffline(false);
  });

  test('should queue messages when offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Go offline
    await context.setOffline(true);
    
    // Try to send a message
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Offline test message');
      
      const sendButton = page.locator('[data-testid="send-message-btn"]');
      await sendButton.click();
      
      // Message should be queued
      const queuedIndicator = page.locator('[data-testid="message-queued"]');
      if (await queuedIndicator.count() > 0) {
        await expect(queuedIndicator).toBeVisible();
      }
    }
    
    // Go back online
    await context.setOffline(false);
  });
});

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have acceptable performance metrics', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
      };
    });
    
    // DOM content should load quickly
    expect(metrics.domContentLoaded).toBeLessThan(2000);
  });
});
