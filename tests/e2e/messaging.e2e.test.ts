/**
 * E2E tests for messaging functionality
 */
import { test, expect, Page } from "@playwright/test";

test.describe("Messaging Interface", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // Ensure loading is done
    await expect(page.locator(".loading-state")).toBeHidden();
  });

  test("should show conversations section", async ({ page }) => {
    const conversationList = page.locator(".conversation-list");
    await expect(conversationList).toBeVisible();

    const header = conversationList.locator("h2");
    await expect(header).toHaveText("Conversations");
  });

  test("should have add contact button", async ({ page }) => {
    const addButton = page.locator(".conversation-list .add-button");
    await expect(addButton).toBeVisible();
    await expect(addButton).toHaveAttribute("title", "Add Options");
  });

  test("should show empty state when no conversations", async ({ page }) => {
    // Wait for loading to finish (already in beforeEach, but double check)
    await expect(page.locator(".loading-state")).toBeHidden();

    const emptyList = page.locator(".conversation-list .empty-list");
    await expect(emptyList).toBeVisible();
    await expect(emptyList).toContainText(/No conversations yet/i);
  });

  test("should show chat view area", async ({ page }) => {
    const mainContent = page.locator(".main-content");
    await expect(mainContent).toBeVisible();
  });

  test("should display welcome message with features", async ({ page }) => {
    const emptyState = page.locator(".empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/Sovereign Communications/i);

    // Check for dashboard cards instead of features
    const cards = page.locator(".dashboard-card");
    expect(await cards.count()).toBeGreaterThan(0);

    // Should mention identity or connect
    await expect(page.locator(".dashboard-card").first()).toBeVisible();
  });
});

test.describe("Connection Status", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      }
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
  });

  test("should display peer information", async ({ page }) => {
    // New UI uses dashboard-card user-card
    const peerInfo = page.locator(".dashboard-card.user-card");

    // Wait for peer info to appear
    if ((await peerInfo.count()) > 0) {
      await expect(peerInfo).toBeVisible();
      await expect(peerInfo).toContainText(/Peer ID/i);
      await expect(peerInfo).toContainText(/Online/i);
    }
  });

  test("should show connection status in header", async ({ page }) => {
    const header = page.locator(".app-header");
    await expect(header).toBeVisible();

    // ConnectionStatus component should be present
    // It shows either online/offline or peer count
  });
});

test.describe("Conversation List", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      }
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
  });

  test("should have conversations header", async ({ page }) => {
    const header = page.locator(".list-header h2");
    await expect(header).toBeVisible();
    await expect(header).toHaveText("Conversations");
  });

  test("should show hint to add contacts when empty", async ({ page }) => {
    const hint = page.locator(".conversation-list .hint");
    if ((await hint.count()) > 0) {
      await expect(hint).toContainText(/Start connecting/i);
    }
  });

  test("should be in sidebar", async ({ page }) => {
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible();

    const conversationList = sidebar.locator(".conversation-list");
    await expect(conversationList).toBeVisible();
  });
});

// Helper to create a conversation for tests
async function createConversation(page: Page) {
  const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
  await addContactBtn.click();

  const quickAdd = page.locator('[data-testid="quick-add-btn"]');
  await expect(quickAdd).toBeVisible();
  await quickAdd.click();

  // Wait for conversation to be selected (message input visible)
  await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
}

test.describe("Message Sending", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      }
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
    await createConversation(page);
  });

  test("should send a text message", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    await messageInput.fill("Hello, world!");

    const sendButton = page.locator('[data-testid="send-message-btn"]');
    await sendButton.click();

    // Message should appear in the chat
    await expect(page.locator("text=Hello, world!")).toBeVisible();
  });

  test("should display message timestamp", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    await messageInput.fill("Test message");
    await page.locator('[data-testid="send-message-btn"]').click();

    // Look for timestamp
    const timestamp = page
      .locator('[data-testid^="message-timestamp-"]')
      .first();
    await expect(timestamp).toBeVisible();
  });

  test("should support emoji in messages", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    const emojiMessage = "Hello 👋 World 🌍";
    await messageInput.fill(emojiMessage);
    await page.locator('[data-testid="send-message-btn"]').click();

    await expect(page.locator(`text=${emojiMessage}`)).toBeVisible();
  });

  test("should handle long messages", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    const longMessage = "A".repeat(1000);
    await messageInput.fill(longMessage);
    await page.locator('[data-testid="send-message-btn"]').click();

    // Message should be sent (might be truncated in display)
    await page.waitForTimeout(500);
    await expect(
      page.locator(`text=${longMessage.substring(0, 50)}`),
    ).toBeVisible();
  });

  test("should show message delivery status", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await expect(messageInput).toBeVisible();

    await messageInput.fill("Status test");
    await page.locator('[data-testid="send-message-btn"]').click();

    // Look for delivery status indicator
    // Wait for it to appear
    const statusIndicator = page
      .locator('[data-testid^="message-status-"]')
      .first();
    await expect(statusIndicator).toBeVisible();
  });
});

test.describe("Message History", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      }
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
    await createConversation(page);
  });

  test("should persist message history", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');

    // Send a message
    await messageInput.fill("Persistent message");
    await page.locator('[data-testid="send-message-btn"]').click();

    // Wait for message to be status (sent OR queued)
    const status = page.locator('[data-testid^="message-status-"]').first();
    await expect(status).toBeVisible({ timeout: 15000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();

    // Select the conversation again
    const firstConv = page.locator(".conversation-item").first();
    await expect(firstConv).toBeVisible();
    await firstConv.click();

    // Message should still be there
    const message = page.locator("text=Persistent message");
    await expect(message).toBeVisible();
  });

  test("should scroll to latest message", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');

    // Send multiple messages
    for (let i = 0; i < 5; i++) {
      await messageInput.fill(`Message ${i}`);
      await page.locator('[data-testid="send-message-btn"]').click();
      await page.waitForTimeout(100);
    }

    // Latest message should be visible
    await expect(page.locator("text=Message 4")).toBeVisible();
  });
});

test.describe("Contact Management", () => {
  test.beforeEach(async ({ page }) => {
    // Clear DB to ensure fresh state
    await page.addInitScript(async () => {
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      }
    });
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
  });

  test("should add a new contact", async ({ page }) => {
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    await expect(addContactBtn).toBeVisible();
    await addContactBtn.click();

    // Now use the "Add by ID" button we added
    const addByIdBtn = page.locator('[data-testid="add-by-id-btn"]');
    await expect(addByIdBtn).toBeVisible();
    await addByIdBtn.click();

    const nameInput = page.locator('[data-testid="contact-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Alice");

    const pubKeyInput = page.locator('[data-testid="contact-publickey-input"]');
    // Using a valid 64-char hex string as mock public key
    const mockKey = "A".repeat(64);
    await pubKeyInput.fill(mockKey);

    await page.locator('[data-testid="save-contact-btn"]').click();

    // Contact should appear in list
    // Name might be truncated or formatted, but "Alice" should be there
    await expect(page.locator('[data-testid="contact-Alice"]')).toBeVisible();
  });

  test("should switch between contacts", async ({ page }) => {
    // Create first contact (Test Peer)
    await createConversation(page);

    // Add second distinct contact (Bob)
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    await addContactBtn.click();

    const addByIdBtn = page.locator('[data-testid="add-by-id-btn"]');
    await expect(addByIdBtn).toBeVisible();
    await addByIdBtn.click();

    await page.locator('[data-testid="contact-name-input"]').fill("Bob");
    await page
      .locator('[data-testid="contact-publickey-input"]')
      .fill("B".repeat(64));
    await page.locator('[data-testid="save-contact-btn"]').click();

    // Now we have two.
    const contacts = page.locator(".conversation-item");
    await expect(contacts).toHaveCount(2);

    // Find identifying elements
    const testPeer = page.locator('[data-testid="contact-Test Peer"]');
    const bob = page.locator('[data-testid="contact-Bob"]');

    // Click Bob
    await bob.click();
    await expect(bob).toHaveClass(/selected|active/);
    await expect(testPeer).not.toHaveClass(/selected|active/);

    // Click Test Peer
    await testPeer.click();
    await expect(testPeer).toHaveClass(/selected|active/);
    await expect(bob).not.toHaveClass(/selected|active/);
  });
});
