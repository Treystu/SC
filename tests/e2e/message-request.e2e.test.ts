import { test, expect } from "@playwright/test";

test.describe("Message Requests", () => {
  test.beforeEach(async ({ page }) => {
    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();
    
    // Wait for helper exposure
    await page.waitForFunction(() => typeof (window as any).getDatabase === 'function');
  });

  test("should display message request banner for pending conversations", async ({ page }) => {
    // Inject a pending conversation directly into IndexedDB via evaluate
    await page.evaluate(async () => {
      const db = (window as any).getDatabase();
      const pendingPeerId = "pending-peer-id";
      
      // Save conversation with request metadata
      await db.saveConversation({
        id: pendingPeerId,
        contactId: pendingPeerId,
        lastMessageTimestamp: Date.now(),
        unreadCount: 1,
        createdAt: Date.now(),
        metadata: {
          isRequest: true,
          requestStatus: 'pending'
        }
      });
      
      // Save a message from this peer
      await db.saveMessage({
        id: "msg-1",
        senderId: pendingPeerId,
        conversationId: pendingPeerId,
        content: "Hello, I am a new stranger",
        timestamp: Date.now(),
        type: "text",
        status: "delivered"
      });
      
      // Notify UI
      window.dispatchEvent(new CustomEvent('sc_conversations_updated'));
    });

    // Verify conversation appears with request badge
    const conversationItem = page.locator('[data-peer-id="pending-peer-id"]');
    await expect(conversationItem).toBeVisible();
    await expect(conversationItem).toContainText("Request");

    // Click to open
    await conversationItem.click();

    // Verify banner is shown
    const banner = page.locator(".message-request-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("wants to send you a message");
    
    // Verify actions
    const acceptBtn = banner.locator("button", { hasText: "Accept" });
    const blockBtn = banner.locator("button", { hasText: "Block & Delete" });
    await expect(acceptBtn).toBeVisible();
    await expect(blockBtn).toBeVisible();

    // Verify input is hidden
    const input = page.locator('[data-testid="message-input"]');
    await expect(input).toBeHidden();

    // Accept request
    await acceptBtn.click();

    // Verify banner is gone and input appears
    await expect(banner).toBeHidden();
    await expect(input).toBeVisible();
    
    // Verify badge is gone from list
    await expect(conversationItem).not.toContainText("Request");
  });

  test("should delete conversation when ignored", async ({ page }) => {
    // Mock window.confirm to return true
    page.on('dialog', dialog => dialog.accept());

    // Inject pending conversation
    await page.evaluate(async () => {
      const db = (window as any).getDatabase();
      const ignorePeerId = "ignore-peer-id";
      
      await db.saveConversation({
        id: ignorePeerId,
        contactId: ignorePeerId,
        lastMessageTimestamp: Date.now(),
        unreadCount: 1,
        createdAt: Date.now(),
        metadata: {
          isRequest: true,
          requestStatus: 'pending'
        }
      });
      
      window.dispatchEvent(new CustomEvent('sc_conversations_updated'));
    });

    // Open conversation
    const conversationItem = page.locator('[data-peer-id="ignore-peer-id"]');
    await conversationItem.click();

    // Click Block & Delete
    const blockBtn = page.locator("button", { hasText: "Block & Delete" });
    await blockBtn.click();

    // Verify conversation is removed from list
    await expect(conversationItem).toBeHidden();
    
    // Verify empty state or cleared selection
    const banner = page.locator(".message-request-banner");
    await expect(banner).toBeHidden();
  });
});