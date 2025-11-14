/**
 * Visual regression tests
 */
import { test, expect } from '@playwright/test';

test.describe.skip('Visual Regression', () => {
  test('home page layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of full page
    await expect(page).toHaveScreenshot('home-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('home-page-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('dark mode (if supported)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to enable dark mode
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"]');
    if (await darkModeToggle.count() > 0) {
      await darkModeToggle.click();
      await page.waitForTimeout(500);
      
      await expect(page).toHaveScreenshot('home-page-dark.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('chat interface', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const chatArea = page.locator('[data-testid="chat-area"]');
    if (await chatArea.count() > 0) {
      await expect(chatArea).toHaveScreenshot('chat-interface.png', {
        animations: 'disabled',
      });
    }
  });

  test('peer list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const peerList = page.locator('[data-testid="peer-list"]');
    if (await peerList.count() > 0) {
      await expect(peerList).toHaveScreenshot('peer-list.png', {
        animations: 'disabled',
      });
    }
  });

  test('settings panel', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const settingsBtn = page.locator('[data-testid="settings-btn"]');
    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);
      
      const settingsPanel = page.locator('[data-testid="settings-panel"]');
      await expect(settingsPanel).toHaveScreenshot('settings-panel.png', {
        animations: 'disabled',
      });
    }
  });

  test('contact card', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const firstContact = page.locator('[data-testid^="contact-"]').first();
    if (await firstContact.count() > 0) {
      await expect(firstContact).toHaveScreenshot('contact-card.png', {
        animations: 'disabled',
      });
    }
  });
});

test.describe.skip('Component Visual Tests', () => {
  test('button states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const button = page.locator('button').first();
    if (await button.count() > 0) {
      // Normal state
      await expect(button).toHaveScreenshot('button-normal.png');
      
      // Hover state
      await button.hover();
      await expect(button).toHaveScreenshot('button-hover.png');
    }
  });

  test('form inputs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const input = page.locator('input[type="text"]').first();
    if (await input.count() > 0) {
      // Empty state
      await expect(input).toHaveScreenshot('input-empty.png');
      
      // Filled state
      await input.fill('Test input');
      await expect(input).toHaveScreenshot('input-filled.png');
      
      // Focus state
      await input.focus();
      await expect(input).toHaveScreenshot('input-focused.png');
    }
  });
});
