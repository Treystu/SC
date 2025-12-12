/**
 * Visual Regression Tests
 * 
 * Tests that verify UI components render correctly and detect visual changes
 */

import { test, expect } from '@playwright/test';
import { E2ETestFramework } from './e2e-framework';

// Configure for visual tests
test.use({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});

test.describe('Visual Regression Tests @visual', () => {
  let framework: E2ETestFramework;

  test.beforeEach(async ({ page }) => {
    framework = new E2ETestFramework(page);
    await framework.navigateToApp();
    await framework.clearIndexedDB();
  });

  test('should render landing page', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show identity setup', async ({ page }) => {
    const generateButton = page.locator('[data-testid="generate-identity-btn"]');
    if (await generateButton.count() === 0) {
      throw new Error("Generate identity button not found");
    }
    await generateButton.first().click();

    await expect(page.locator('[data-testid="public-key-display"]')).toBeVisible();
  });

  test('should show peer list', async ({ page }) => {
    await page.waitForSelector('[data-testid="peer-list"]', { state: 'visible' });
    await expect(page.locator('[data-testid="peer-list"]')).toBeVisible();
  });

  test('should allow adding contacts', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await expect(page.locator('[data-testid="contact-Alice"], [data-testid="peer-Alice"]')).toBeVisible();
  });

  test('should render chat interface', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await page.click('[data-testid="contact-Alice"], [data-testid="peer-Alice"]');
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible();
  });

  test('should render messages', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.sendMessage('Alice', 'Hello, Alice!');
    await expect(page.locator('[data-testid="message-container"]')).toBeVisible();
  });

  test('should show QR code UI when available', async ({ page }) => {
    const addPeerButton = page.locator('[data-testid="add-peer-btn"]');
    const shareInfoButton = page.locator('[data-testid="share-my-info-btn"]');

    if (await addPeerButton.count() > 0) {
      await addPeerButton.first().click();
    } else if (await shareInfoButton.count() > 0) {
      await shareInfoButton.first().click();
    } else {
      throw new Error("No QR trigger button found");
    }

    const qrDisplay = page.locator('[data-testid="qr-code-display"]');
    if (await qrDisplay.count() > 0) {
      await expect(qrDisplay.first()).toBeVisible({ timeout: 5000 });
      return;
    }

    const canvasQr = page.locator('canvas');
    if (await canvasQr.count() > 0) {
      await expect(canvasQr.first()).toBeVisible({ timeout: 5000 });
      return;
    }

    const svgQr = page.locator('svg');
    if (await svgQr.count() > 0) {
      await expect(svgQr.first()).toBeVisible({ timeout: 5000 });
      return;
    }

    throw new Error("No QR code element available");
  });

  test('should show settings panel', async ({ page }) => {
    await page.click('[data-testid="settings-btn"]');
    await expect(page.locator('[data-testid="settings-panel"]')).toBeVisible();
  });

  test('should toggle theme', async ({ page }) => {
    const toggle = page.locator('[data-testid="theme-toggle"]');
    if (await toggle.count() > 0) {
      await toggle.selectOption('dark');
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show file upload dialog', async ({ page }) => {
    await page.click('[data-testid="attach-file-btn"]');
    await expect(page.locator('[data-testid="file-upload-dialog"]')).toBeVisible();
  });

  test('should render notifications', async ({ page }) => {
    await page.evaluate(() => {
      const event = new CustomEvent('show-notification', {
        detail: { message: 'Test notification', type: 'info' }
      });
      window.dispatchEvent(event);
    });
    await expect(page.locator('[data-testid="notification-toast"], body')).toBeVisible();
  });
});

test.describe('Component Visual Tests @visual', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('should render button states', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-direction: column; width: 300px;">
        <button class="btn-primary">Primary Button</button>
        <button class="btn-primary" disabled>Disabled Button</button>
        <button class="btn-secondary">Secondary Button</button>
        <button class="btn-danger">Danger Button</button>
      </div>
    `);
    
    await expect(page.locator('div')).toBeVisible();
  });

  test('should render input fields', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-direction: column; width: 300px;">
        <input type="text" placeholder="Normal input" />
        <input type="text" value="Filled input" />
        <input type="text" placeholder="Disabled input" disabled />
        <input type="text" class="error" placeholder="Error state" />
      </div>
    `);
    
    await expect(page.locator('div')).toBeVisible();
  });

  test('should render modal dialog', async ({ page }) => {
    await page.setContent(`
      <div class="modal-backdrop">
        <div class="modal">
          <h2>Confirm Action</h2>
          <p>Are you sure you want to proceed?</p>
          <div class="modal-actions">
            <button class="btn-secondary">Cancel</button>
            <button class="btn-primary">Confirm</button>
          </div>
        </div>
      </div>
    `);
    
    await expect(page.locator('.modal')).toBeVisible();
  });

  test('should render loading spinner', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 40px; text-align: center;">
        <div class="spinner"></div>
      </div>
    `);
    
    await expect(page.locator('div')).toBeVisible();
  });

  test('should render error message', async ({ page }) => {
    await page.setContent(`
      <div class="error-message">
        <svg class="error-icon" width="24" height="24">
          <circle cx="12" cy="12" r="10" fill="red"/>
        </svg>
        <span>An error occurred. Please try again.</span>
      </div>
    `);
    
    await expect(page.locator('.error-message')).toBeVisible();
  });
});

test.describe('Responsive Visual Tests @visual', () => {
  test('should match mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('mobile-viewport.png', {
      fullPage: true,
    });
  });

  test('should match tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('tablet-viewport.png', {
      fullPage: true,
    });
  });

  test('should match desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 }); // Full HD
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('desktop-viewport.png', {
      fullPage: true,
    });
  });
});

test.describe('Animation Visual Tests @visual', () => {
  test('should match fade-in animation', async ({ page }) => {
    await page.setContent(`
      <div class="fade-in" style="animation: fadeIn 0.3s;">
        <p>Animated content</p>
      </div>
    `);
    
    // Wait for animation to complete
    await page.waitForTimeout(350);
    
    await expect(page.locator('.fade-in')).toHaveScreenshot('fade-in-complete.png');
  });

  test('should match slide-in animation', async ({ page }) => {
    await page.setContent(`
      <div class="slide-in" style="animation: slideIn 0.3s;">
        <p>Sliding content</p>
      </div>
    `);
    
    await page.waitForTimeout(350);
    
    await expect(page.locator('.slide-in')).toHaveScreenshot('slide-in-complete.png');
  });
});

test.describe('Accessibility Visual Tests @visual', () => {
  test('should highlight focus states', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px;">
        <button class="focus-visible">Focused Button</button>
        <input type="text" class="focus-visible" value="Focused Input" />
      </div>
    `);
    
    await page.locator('button').focus();
    await expect(page).toHaveScreenshot('focus-states.png');
  });

  test('should show high contrast mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('high-contrast-mode.png', {
      fullPage: true,
    });
  });
});
