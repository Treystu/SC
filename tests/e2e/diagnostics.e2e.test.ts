import { test, expect } from '@playwright/test';

test.describe.skip('NetworkDiagnostics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open and close the network diagnostics modal', async ({ page }) => {
    await page.click('button[aria-label="Network Diagnostics"]');
    await expect(page.locator('.diagnostics-modal')).toBeVisible();

    await page.click('button[aria-label="Close diagnostics"]');
    await expect(page.locator('.diagnostics-modal')).not.toBeVisible();
  });

  test('should display network diagnostics information', async ({ page }) => {
    await page.click('button[aria-label="Network Diagnostics"]');
    await expect(page.locator('text=Network Diagnostics')).toBeVisible();
    await expect(page.locator('text=Connected Peers')).toBeVisible();
  });
});