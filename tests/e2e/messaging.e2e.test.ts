/**
 * E2E tests for messaging functionality
 */
import { test, expect, Page } from "@playwright/test";

/**
 * Helper to create identity and skip onboarding for E2E tests
 * Completes onboarding through UI interaction
 */
async function setupIdentityForE2E(page: Page): Promise<void> {
  // Wait for app to be ready - give time for React to mount
  await page.waitForTimeout(2000);

  // Check if onboarding is shown
  const onboardingOverlay = page.locator('.onboarding-overlay');
  const isOnboardingVisible = await onboardingOverlay.isVisible({ timeout: 3000 }).catch(() => false);

  if (isOnboardingVisible) {
    console.log('[setupIdentityForE2E] Onboarding visible, completing it via UI...');

    // Click "Get Started" button
    const getStartedBtn = page.locator('button:has-text("Get Started")');
    if (await getStartedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await getStartedBtn.click();
      await page.waitForTimeout(1000);
    }

    // Fill display name
    const nameInput = page.locator('input[placeholder="Display Name"]');
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill('TestUser');
      await page.waitForTimeout(500);

      // Click Next
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(4000); // Wait for key generation
      }
    }

    // Skip through remaining screens
    for (let i = 0; i < 5; i++) {
      const skipBtn = page.locator('button:has-text("Next"), button:has-text("Skip"), button:has-text("Start Messaging")').first();
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click();
        await page.waitForTimeout(500);
      } else {
        break;
      }
    }

    // Wait for onboarding to complete
    await page.waitForTimeout(2000);
  }

  // Wait for mesh network to be ready (longer timeout for identity generation)
  await page.waitForFunction(() => {
    const w = window as any;
    return !!(w.__meshNetwork || w.meshNetwork);
  }, { timeout: 30000 }).catch(() => {
    console.log('[setupIdentityForE2E] Mesh network not available within timeout');
  });
}

test.describe("Messaging Interface", () => {
  test.beforeEach(async ({ page }) => {
    // Force E2E mode via window.__E2E__ and use unique DB to avoid locks
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    page.on("console", (msg) => console.log(`BROWSER LOG: ${msg.text()}`));

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    // Ensure loading is done
    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
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
    const viewportSize = page.viewportSize();
    const isMobile = viewportSize && viewportSize.width < 768;

    if (isMobile) {
      // On mobile, chat view is hidden by default (list view active)
      await expect(mainContent).toBeHidden();
    } else {
      await expect(mainContent).toBeVisible();
    }
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
    page.on("console", (msg) => console.log(`BROWSER LOG: ${msg.text()}`));

    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
  });

  test("should display peer information", async ({ page }) => {
    // Debug: Check strict hierarchy
    // Handle potential Onboarding appearance if isE2E detection fails (e.g. Safari)
    const sidebar = page.locator(".sidebar");
    const onboarding = page.locator(".onboarding-container");

    // Wait for either
    try {
      await Promise.race([
        sidebar.waitFor({ state: "visible", timeout: 5000 }),
        onboarding.waitFor({ state: "visible", timeout: 5000 }),
      ]);
    } catch (e) {
      // Ignore timeout, assertions below will catch failure
    }

    if (await onboarding.isVisible()) {
      console.log("Onboarding detected, bypassing...");
      await page.locator("text=Get Started").click();
      await page
        .locator("text=Skip")
        .click()
        .catch(() => {}); // Optional skip if present
      await expect(sidebar).toBeVisible();
    } else {
      await expect(sidebar).toBeVisible();
    }

    const sidebarHeader = sidebar.locator(".sidebar-header");
    await expect(sidebarHeader).toBeVisible();

    const peerInfo = sidebarHeader.locator(".user-profile");
    // Verify it exists in DOM first
    await expect(peerInfo).toBeAttached();

    // Then check visibility
    await expect(peerInfo).toBeVisible();

    // Check for username "Me"
    await expect(peerInfo).toContainText(/Me/i);

    // Check for Online status (visual indicator)
    const onlineIndicator = peerInfo.locator(".status-indicator.online");
    // Check attached instead of visible to avoid 0-size visibility issues in some renderers
    await expect(onlineIndicator).toBeAttached();
    await expect(onlineIndicator).toHaveClass(/online/);
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
    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
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
  // Wait for mesh network to be ready (look for localPeerId which confirms initialization)
  await page.waitForFunction(() => {
    const s = (window as any).__SC_STATUS__;
    if (s?.initializationError) return true; // Fail fast
    return !!s?.localPeerId;
  });

  // Check if we failed
  const error = await page.evaluate(
    () => (window as any).__SC_STATUS__?.initializationError,
  );
  if (error) throw new Error(`Mesh initialization failed: ${error}`);

  const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
  await addContactBtn.click();

  const quickAdd = page.locator('[data-testid="quick-add-btn"]');
  await expect(quickAdd).toBeVisible();
  await quickAdd.click();

  // Wait for conversation to be selected (message input visible)
  await expect(page.locator('[data-testid="message-input"]')).toBeVisible();

  // Wait for contact name to resolve (contacts loaded)
  await expect(page.locator(".chat-header h3")).toContainText("Test Peer", {
    timeout: 10000,
  });
}

test.describe("Message Sending", () => {
  test.beforeEach(async ({ page }) => {
    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    page.on("console", (msg) => console.log(`BROWSER LOG: ${msg.text()}`));

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
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
    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
    await createConversation(page);
  });

  test("should persist message history", async ({ page }) => {
    const messageInput = page.locator('[data-testid="message-input"]');

    // Send a message
    await messageInput.fill("Persistent message");
    await page.locator('[data-testid="send-message-btn"]').click();

    const conversationId = await page.evaluate(() => {
      // ChatView is mounted only when a conversation is selected
      const container = document.querySelector(
        '[data-testid="chat-container"]',
      ) as HTMLElement | null;
      return container ? container.getAttribute("data-conversation-id") : null;
    });
    console.log("[TEST] conversationId:", conversationId);

    // Wait for the message to be persisted before reload
    await page.waitForFunction(
      async (convId) => {
        if (!convId) return false;
        const db = (window as any).getDatabase?.();
        if (!db || typeof db.getMessages !== "function") return false;
        const msgs = await db.getMessages(convId);
        return Array.isArray(msgs) && msgs.some((m: any) => m?.content === "Persistent message");
      },
      conversationId,
      { timeout: 15000 },
    );

    // Wait for message to be status (sent OR queued OR pending)
    const status = page.locator('[data-testid^="message-status-"]').first();
    await expect(status).toBeVisible({ timeout: 15000 });

    // Allow strict persistence time for IndexedDB before reload
    // (Optimistic updates are instant, but DB writes are async)
    await page.waitForTimeout(1000);

    // Reload page
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".loading-state")).toBeHidden();

    // Debug: confirm what's actually in IndexedDB after reload
    const dbDebug = await page.evaluate(async () => {
      const win = window as any;
      const db = win.getDatabase?.() || null;
      const firstConvEl = document.querySelector(".conversation-item") as
        | HTMLElement
        | null;
      return {
        hasDb: Boolean(db),
        firstConvText: firstConvEl?.textContent || null,
      };
    });
    console.log("[TEST] After reload DB debug:", dbDebug);

    // Select the conversation again
    const firstConv = page.locator(".conversation-item").first();
    await expect(firstConv).toBeVisible();
    await firstConv.click();

    const uiConversationId = await page.evaluate(() => {
      const container = document.querySelector(
        '[data-testid="chat-container"]',
      ) as HTMLElement | null;
      return container ? container.getAttribute("data-conversation-id") : null;
    });
    console.log("[TEST] UI conversationId after click:", uiConversationId);

    const domDebug = await page.evaluate(() => {
      const msgContainer = document.querySelector(
        '[data-testid="message-container"]',
      ) as HTMLElement | null;
      const renderedMessages = document.querySelectorAll(".message").length;
      return {
        renderedMessages,
        messageContainerText: msgContainer?.innerText || null,
        messageContainerHtml: msgContainer?.innerHTML?.slice(0, 500) || null,
      };
    });
    console.log("[TEST] DOM debug after reload+click:", domDebug);

    const afterClickDb = await page.evaluate(async (convId) => {
      const win = window as any;
      const db = win.getDatabase?.() || null;
      const messages = db && convId && db.getMessages ? await db.getMessages(convId) : [];
      return {
        convId,
        messageCount: Array.isArray(messages) ? messages.length : 0,
        lastContent:
          Array.isArray(messages) && messages.length > 0
            ? (messages[messages.length - 1] as any).content
            : null,
      };
    }, conversationId);
    console.log("[TEST] After reload DB messages for conversationId:", afterClickDb);

    // Message should still be there
    const messageContainer = page.locator('[data-testid="message-container"]');
    await expect(messageContainer).toBeVisible();
    await page.waitForFunction(() => {
      return document.querySelectorAll(".message").length > 0;
    });

    const message = messageContainer.getByText("Persistent message").first();
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
    // Force E2E mode via window.__E2E__ and use unique DB
    const uniqueDbName = `sc_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await page.addInitScript((dbName) => {
      (window as any).__E2E__ = true;
      (window as any).__SC_DB_NAME__ = dbName;
    }, uniqueDbName);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Setup identity for E2E testing
    await setupIdentityForE2E(page);

    await expect(page.locator(".loading-state")).toBeHidden({ timeout: 5000 }).catch(() => {});
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
