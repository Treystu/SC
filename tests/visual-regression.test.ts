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

  test('should match landing page screenshot', async ({ page }) => {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Take screenshot and compare with baseline
    await expect(page).toHaveScreenshot('landing-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should match identity setup screen', async ({ page }) => {
    await page.click('[data-testid="generate-identity-btn"]');
    await page.waitForSelector('[data-testid="public-key-display"]');
    
    await expect(page).toHaveScreenshot('identity-setup.png', {
      fullPage: true,
      animations: 'disabled',
      mask: [page.locator('[data-testid="public-key-display"]')], // Mask dynamic content
    });
  });

  test('should match peer list empty state', async ({ page }) => {
    await page.waitForSelector('[data-testid="peer-list"]');
    
    await expect(page.locator('[data-testid="peer-list"]')).toHaveScreenshot('peer-list-empty.png');
  });

  test('should match peer list with contacts', async ({ page }) => {
    // Add some test contacts
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.createNewContact('Bob', '2'.repeat(64));
    await framework.createNewContact('Charlie', '3'.repeat(64));
    
    await page.waitForSelector('[data-testid="peer-Charlie"]');
    
    await expect(page.locator('[data-testid="peer-list"]')).toHaveScreenshot('peer-list-with-contacts.png');
  });

  test('should match chat interface', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await page.click('[data-testid="peer-Alice"]');
    await page.waitForSelector('[data-testid="chat-container"]');
    
    await expect(page.locator('[data-testid="chat-container"]')).toHaveScreenshot('chat-interface.png');
  });

  test('should match message bubbles', async ({ page }) => {
    await framework.createNewContact('Alice', '1'.repeat(64));
    await framework.sendMessage('Alice', 'Hello, Alice!');
    await framework.sendMessage('Alice', 'How are you?');
    
    await page.waitForSelector('[data-testid="message-container"]');
    
    await expect(page.locator('[data-testid="message-container"]')).toHaveScreenshot('message-bubbles.png');
  });

  test('should match QR code display', async ({ page }) => {
    await page.click('[data-testid="add-peer-btn"]');
    await page.click('[data-testid="qr-method-tab"]');
    await page.waitForSelector('[data-testid="qr-code-display"]');
    
    await expect(page.locator('[data-testid="qr-code-display"]')).toHaveScreenshot('qr-code-display.png', {
      mask: [page.locator('canvas')], // Mask QR code content (dynamic)
    });
  });

  test('should match settings panel', async ({ page }) => {
    await page.click('[data-testid="settings-btn"]');
    await page.waitForSelector('[data-testid="settings-panel"]');
    
    await expect(page.locator('[data-testid="settings-panel"]')).toHaveScreenshot('settings-panel.png');
  });

  test('should match dark theme', async ({ page }) => {
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500); // Wait for theme transition
    
    await expect(page).toHaveScreenshot('dark-theme.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should match file transfer UI', async ({ page }) => {
    await framework.createNewContact('Bob', '2'.repeat(64));
    
    // Simulate file selection
    await page.click('[data-testid="attach-file-btn"]');
    await page.waitForSelector('[data-testid="file-upload-dialog"]');
    
    await expect(page.locator('[data-testid="file-upload-dialog"]')).toHaveScreenshot('file-upload-dialog.png');
  });

  test('should match notification toast', async ({ page }) => {
    // Trigger a notification
    await page.evaluate(() => {
      const event = new CustomEvent('show-notification', {
        detail: { message: 'Test notification', type: 'info' }
      });
      window.dispatchEvent(event);
    });
    
    await page.waitForSelector('[data-testid="notification-toast"]');
    
    await expect(page.locator('[data-testid="notification-toast"]')).toHaveScreenshot('notification-toast.png');
  });
});

test.describe('Component Visual Tests @visual', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('should match button states', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-direction: column; width: 300px;">
        <button class="btn-primary">Primary Button</button>
        <button class="btn-primary" disabled>Disabled Button</button>
        <button class="btn-secondary">Secondary Button</button>
        <button class="btn-danger">Danger Button</button>
      </div>
    `);
    
    await expect(page.locator('div')).toHaveScreenshot('button-states.png');
  });

  test('should match input fields', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 20px; display: flex; gap: 10px; flex-direction: column; width: 300px;">
        <input type="text" placeholder="Normal input" />
        <input type="text" value="Filled input" />
        <input type="text" placeholder="Disabled input" disabled />
        <input type="text" class="error" placeholder="Error state" />
      </div>
    `);
    
    await expect(page.locator('div')).toHaveScreenshot('input-states.png');
  });

  test('should match modal dialog', async ({ page }) => {
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
    
    await expect(page.locator('.modal')).toHaveScreenshot('modal-dialog.png');
  });

  test('should match loading spinner', async ({ page }) => {
    await page.setContent(`
      <div style="padding: 40px; text-align: center;">
        <div class="spinner"></div>
      </div>
    `);
    
    await expect(page.locator('div')).toHaveScreenshot('loading-spinner.png');
  });

  test('should match error message', async ({ page }) => {
    await page.setContent(`
      <div class="error-message">
        <svg class="error-icon" width="24" height="24">
          <circle cx="12" cy="12" r="10" fill="red"/>
        </svg>
        <span>An error occurred. Please try again.</span>
      </div>
    `);
    
    await expect(page.locator('.error-message')).toHaveScreenshot('error-message.png');
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
