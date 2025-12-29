import { test, expect } from '@playwright/test';

// E2E test for MeshNetwork integration in the browser

test.describe('MeshNetwork Integration', () => {
  test('should initialize and join a room, send a message', async ({ page }) => {
    // 1. Go to the local dev server
    await page.goto('http://localhost:3001');

    // 2. Wait for mesh network to initialize (look for peer ID or status)
    await expect(page.locator('[data-testid="local-peer-id"]')).toBeVisible({ timeout: 10000 });

    // 3. Join a public room (simulate user action)
    await page.click('[data-testid="join-room-btn"]');
    await page.fill('[data-testid="room-url-input"]', 'https://example.com/room');
    await page.click('[data-testid="confirm-join-room-btn"]');

    // 4. Wait for joined state
    await expect(page.locator('[data-testid="room-status"]')).toHaveText(/joined/i, { timeout: 10000 });

    // 5. Send a message
    await page.fill('[data-testid="message-input"]', 'Hello World');
    await page.click('[data-testid="send-message-btn"]');

    // 6. Assert message appears in chat (or network log)
    await expect(page.locator('[data-testid="chat-message"]').last()).toContainText('Hello World');
  });
});
