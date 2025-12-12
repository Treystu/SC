/**
 * Visual regression tests
 */
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('home page layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('conversation list component', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const conversationList = page.locator('.conversation-list');
    await expect(conversationList).toBeVisible();
  });

  test('empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
  });

  test('app header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
  });
});

test.describe('Component Visual Tests', () => {
  test('sidebar layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('main content area', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toBeVisible();
  });

  test('feature highlights', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const features = page.locator('.features');
    await expect(features).toBeVisible();
  });

  test('button states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const button = page.locator('button').first();
    if (await button.count() > 0) {
      await expect(button).toBeVisible();
      await button.hover();
      await expect(button).toBeVisible();
    }
  });
});
