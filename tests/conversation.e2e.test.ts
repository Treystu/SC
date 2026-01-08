import { test, expect } from '@playwright/test';

test.describe('Conversation Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('sc-onboarding-complete', 'true');
    });
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
  });

  test('should create a new conversation when adding a contact and allow messaging', async ({ page }) => {
    test.setTimeout(120000);

    await page.waitForSelector('[data-testid="add-contact-btn"]', { state: 'attached', timeout: 30000 });
    await page.click('[data-testid="add-contact-btn"]');
    await page.waitForSelector('.add-menu', { state: 'visible' });
    await page.click('[data-testid="add-by-id-btn"]');

    await page.waitForSelector('[data-testid="contact-name-input"]');
    await page.fill('[data-testid="contact-name-input"]', 'Test Contact');
    await page.fill('[data-testid="contact-publickey-input"]', 'MCowBQYDK2VwAyEAlvC4s');
    await page.click('[data-testid="save-contact-btn"]');

    await expect(page.locator('.conversation-item')).toHaveCount(1, { timeout: 10000 });
    await expect(page.locator('.conversation-item .conversation-name')).toHaveText('Test Contact');

    await page.click('.conversation-item');
    await page.fill('[data-testid="message-input"]', 'Hello, Test Contact!');
    await page.click('[data-testid="send-message-btn"]');

    await expect(page.locator('.message-content')).toHaveText('Hello, Test Contact!');
  });
});
