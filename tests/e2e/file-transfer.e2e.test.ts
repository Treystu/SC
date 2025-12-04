import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe("File Transfer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Create a demo contact if needed
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    if ((await addContactBtn.count()) > 0) {
      await addContactBtn.click();
      const quickAdd = page.locator('[data-testid="quick-add-btn"]');
      if (await quickAdd.isVisible()) {
        await quickAdd.click();

        // Fill contact details if dialog opens
        const nameInput = page.locator('[data-testid="contact-name-input"]');
        if (await nameInput.isVisible()) {
          await nameInput.fill("File Recipient");
          await page
            .locator('[data-testid="contact-publickey-input"]')
            .fill("A".repeat(64));
          await page.locator('[data-testid="save-contact-btn"]').click();
        }
      }
    }

    // Select the contact
    const contact = page.locator(".conversation-item").first();
    if ((await contact.count()) > 0) {
      await contact.click();
    }
  });

  test("should upload and send a file", async ({ page }) => {
    // Create a dummy file
    const testFilePath = path.join(__dirname, "test-file.txt");
    fs.writeFileSync(testFilePath, "This is a test file for E2E testing.");

    try {
      // Click attach button
      const attachBtn = page.locator('[data-testid="attach-file-btn"]');
      await expect(attachBtn).toBeVisible();

      // Handle file chooser
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        attachBtn.click(),
      ]);

      await fileChooser.setFiles(testFilePath);

      // Verify file preview or message input update
      // Assuming the UI shows the selected file or sends immediately
      // If it sends immediately:
      // await expect(page.locator('text=test-file.txt')).toBeVisible();

      // If it waits for send button:
      const sendBtn = page.locator('[data-testid="send-message-btn"]');
      if (await sendBtn.isEnabled()) {
        await sendBtn.click();
      }

      // Verify message appears in chat
      await expect(page.locator(".message-content.file-message")).toBeVisible();
      await expect(page.locator("text=test-file.txt")).toBeVisible();
    } finally {
      // Cleanup
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  test("should show upload progress", async ({ page }) => {
    // Create a larger dummy file
    const testFilePath = path.join(__dirname, "large-test-file.dat");
    const buffer = Buffer.alloc(1024 * 1024); // 1MB
    fs.writeFileSync(testFilePath, buffer);

    try {
      const attachBtn = page.locator('[data-testid="attach-file-btn"]');
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        attachBtn.click(),
      ]);

      await fileChooser.setFiles(testFilePath);

      const sendBtn = page.locator('[data-testid="send-message-btn"]');
      await sendBtn.click();

      // Check for progress bar
      const progressBar = page.locator(".upload-progress");
      await expect(progressBar).toBeVisible();
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });
});
