import { test, expect } from '@playwright/test';

test.describe('MeshNetwork Integration', () => {
  test('should initialize and join a room, send a message', async ({ page }) => {
    await page.goto('/');
    // First, check for the E2E debug banner to confirm React is mounting
    const debugBanner = page.locator('[data-testid="e2e-debug-banner"]');
    await expect(debugBanner).toBeVisible({ timeout: 10000 });
    // Then, wait for the local-peer-id to be visible and not 'Generating...'
    const peerIdLocator = page.locator('[data-testid="local-peer-id"]');
    await expect(peerIdLocator).toBeVisible({ timeout: 20000 });
    await expect(async () => {
      const text = await peerIdLocator.textContent();
      expect(text && text.trim() !== '' && text.trim() !== 'Generating...').toBeTruthy();
    }).toPass({ timeout: 20000 });
    await page.click('[data-testid="join-room-btn"]');
    await page.fill('[data-testid="room-url-input"]', 'https://example.com/room');
    await page.click('[data-testid="confirm-join-room-btn"]');
    await expect(page.locator('[data-testid="room-status"]')).toHaveText(/online/i, { timeout: 10000 });
    await page.fill('[data-testid="message-input"]', 'Hello World');
    await page.click('[data-testid="send-message-btn"]');
    await expect(page.locator('[data-testid="chat-message"]').last()).toContainText('Hello World');
  });
});
