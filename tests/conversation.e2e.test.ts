import { test, expect } from '@playwright/test';

test.describe('Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Bypass onboarding by setting the flag in localStorage
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
      localStorage.setItem('sc-onboarding-complete', 'true');
    });
    // Reload the page for the change to take effect
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('should create a new conversation when adding a contact and allow messaging', async ({ page }) => {
    test.setTimeout(120000); // Increase timeout to 120 seconds

    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console Error: "${msg.text()}"`);
      }
    });

    // The main app should be interactive immediately
    await page.waitForSelector('[data-testid="main-content"]', { timeout: 30000 });

    // Click the add button to open the menu
    await page.click('[data-testid="add-contact-btn"]');

    // Wait for the menu to be visible before clicking the "Quick Add" button
    await page.waitForSelector('.add-menu', { state: 'visible' });

    // Click the "Quick Add" button to open the dialog
    await page.click('[data-testid="quick-add-btn"]');

    // Wait for the dialog's input field to be visible before filling
    const nameInput = '[data-testid="contact-name-input"]';
    await page.waitForSelector(nameInput);
    await page.fill(nameInput, 'Test Contact');
    await page.fill('[data-testid="contact-publickey-input"]', 'MCowBQYDK2VwAyEAlvC4s_v26z_g-6z-g-6z-g-6z-g-6z-g-6z-g-Y');
    await page.click('[data-testid="save-contact-btn"]');

    // Verify that the conversation is created
    await expect(page.locator('.conversation-item')).toHaveCount(1);
    await expect(page.locator('.conversation-item .conversation-name')).toHaveText('Test Contact');

    // Send a message
    await page.click('.conversation-item');
    await page.fill('[data-testid="message-input"]', 'Hello, Test Contact!');
    await page.click('[data-testid="send-message-btn"]');

    // Verify that the message is displayed
    await expect(page.locator('.message-content')).toHaveText('Hello, Test Contact!');
  });
});
