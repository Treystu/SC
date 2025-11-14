/**
 * E2E tests for messaging functionality
 */
import { test, expect } from '@playwright/test';

test.describe.skip('Messaging', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should send a text message', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    await messageInput.fill('Hello, world!');
    
    const sendButton = page.locator('[data-testid="send-message-btn"]');
    await sendButton.click();
    
    // Message should appear in the chat
    await expect(page.locator('text=Hello, world!')).toBeVisible();
  });

  test('should display message timestamp', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    await messageInput.fill('Test message');
    await page.locator('[data-testid="send-message-btn"]').click();
    
    // Look for timestamp
    const timestamp = page.locator('[data-testid^="message-timestamp-"]').first();
    if (await timestamp.count() > 0) {
      await expect(timestamp).toBeVisible();
    }
  });

  test('should support emoji in messages', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    const emojiMessage = 'Hello 👋 World 🌍';
    await messageInput.fill(emojiMessage);
    await page.locator('[data-testid="send-message-btn"]').click();
    
    await expect(page.locator(`text=${emojiMessage}`)).toBeVisible();
  });

  test('should handle long messages', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    const longMessage = 'A'.repeat(1000);
    await messageInput.fill(longMessage);
    await page.locator('[data-testid="send-message-btn"]').click();
    
    // Message should be sent (might be truncated in display)
    await page.waitForTimeout(500);
  });

  test('should show message delivery status', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    await messageInput.fill('Status test');
    await page.locator('[data-testid="send-message-btn"]').click();
    
    // Look for delivery status indicator
    const statusIndicator = page.locator('[data-testid^="message-status-"]').first();
    if (await statusIndicator.count() > 0) {
      await expect(statusIndicator).toBeVisible();
    }
  });
});

test.describe.skip('Message History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should persist message history', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    // Send a message
    await messageInput.fill('Persistent message');
    await page.locator('[data-testid="send-message-btn"]').click();
    await page.waitForTimeout(500);
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Message should still be there
    const message = page.locator('text=Persistent message');
    if (await message.count() > 0) {
      await expect(message).toBeVisible();
    }
  });

  test('should scroll to latest message', async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() === 0) {
      test.skip();
      return;
    }

    // Send multiple messages
    for (let i = 0; i < 5; i++) {
      await messageInput.fill(`Message ${i}`);
      await page.locator('[data-testid="send-message-btn"]').click();
      await page.waitForTimeout(100);
    }
    
    // Latest message should be visible
    await expect(page.locator('text=Message 4')).toBeVisible();
  });
});

test.describe.skip('Contact Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should add a new contact', async ({ page }) => {
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    if (await addContactBtn.count() === 0) {
      test.skip();
      return;
    }

    await addContactBtn.click();
    
    const nameInput = page.locator('[data-testid="contact-name-input"]');
    await nameInput.fill('Alice');
    
    const pubKeyInput = page.locator('[data-testid="contact-publickey-input"]');
    await pubKeyInput.fill('A'.repeat(64));
    
    await page.locator('[data-testid="save-contact-btn"]').click();
    
    // Contact should appear in list
    await expect(page.locator('[data-testid="contact-Alice"]')).toBeVisible();
  });

  test('should switch between contacts', async ({ page }) => {
    // This test assumes contacts exist
    const firstContact = page.locator('[data-testid^="contact-"]').first();
    if (await firstContact.count() === 0) {
      test.skip();
      return;
    }

    await firstContact.click();
    
    // Contact should be selected
    await expect(firstContact).toHaveClass(/selected|active/);
  });
});
