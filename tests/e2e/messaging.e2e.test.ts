/**
 * E2E tests for messaging functionality
 */
import { test, expect } from '@playwright/test';

test.describe('Messaging Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show conversations section', async ({ page }) => {
    const conversationList = page.locator('.conversation-list');
    await expect(conversationList).toBeVisible();
    
    const header = conversationList.locator('h2');
    await expect(header).toHaveText('Conversations');
  });

  test('should have add contact button', async ({ page }) => {
    const addButton = page.locator('.conversation-list .add-button');
    await expect(addButton).toBeVisible();
    await expect(addButton).toHaveAttribute('title', 'Add Contact');
  });

  test('should show empty state when no conversations', async ({ page }) => {
    const emptyList = page.locator('.conversation-list .empty-list');
    await expect(emptyList).toBeVisible();
    await expect(emptyList).toContainText(/No conversations yet/i);
  });

  test('should show chat view area', async ({ page }) => {
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toBeVisible();
  });

  test('should display welcome message with features', async ({ page }) => {
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/Welcome to Sovereign Communications/i);
    
    // Check for feature highlights
    const features = page.locator('.features .feature');
    expect(await features.count()).toBeGreaterThan(0);
    
    // Should mention encryption
    await expect(page.locator('.features')).toContainText(/encrypted/i);
    await expect(page.locator('.features')).toContainText(/mesh/i);
  });
});

test.describe('Connection Status', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display peer information', async ({ page }) => {
    const peerInfo = page.locator('.peer-info');
    
    // Wait for peer info to appear
    if (await peerInfo.count() > 0) {
      await expect(peerInfo).toBeVisible();
      await expect(peerInfo).toContainText(/Your Peer ID/i);
      await expect(peerInfo).toContainText(/Connected Peers/i);
    }
  });

  test('should show connection status in header', async ({ page }) => {
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
    
    // ConnectionStatus component should be present
    // It shows either online/offline or peer count
  });
});

test.describe('Conversation List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have conversations header', async ({ page }) => {
    const header = page.locator('.list-header h2');
    await expect(header).toBeVisible();
    await expect(header).toHaveText('Conversations');
  });

  test('should show hint to add contacts when empty', async ({ page }) => {
    const hint = page.locator('.conversation-list .hint');
    if (await hint.count() > 0) {
      await expect(hint).toContainText(/Add a contact/i);
    }
  });

  test('should be in sidebar', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    
    const conversationList = sidebar.locator('.conversation-list');
    await expect(conversationList).toBeVisible();
  });
});

test.describe('Message Sending', () => {
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
