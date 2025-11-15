/**
 * Visual regression tests
 */
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
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

  test('conversation list component', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const conversationList = page.locator('.conversation-list');
    await expect(conversationList).toHaveScreenshot('conversation-list.png', {
      animations: 'disabled',
    });
  });

  test('empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toHaveScreenshot('empty-state.png', {
      animations: 'disabled',
    });
  });

  test('app header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const header = page.locator('.app-header');
    await expect(header).toHaveScreenshot('app-header.png', {
      animations: 'disabled',
    });
  });
});

test.describe('Component Visual Tests', () => {
  test('sidebar layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveScreenshot('sidebar.png', {
      animations: 'disabled',
    });
  });

  test('main content area', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toHaveScreenshot('main-content.png', {
      animations: 'disabled',
    });
  });

  test('feature highlights', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const features = page.locator('.features');
    await expect(features).toHaveScreenshot('features.png', {
      animations: 'disabled',
    });
  });

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
});

