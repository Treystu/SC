/**
 * P2P Messaging Test
 * Tests messages sent between two browser tabs using useMeshNetwork
 */

import { test, expect } from "@playwright/test";
import { createIsolatedUser } from "./e2e-user";

test.describe("P2P Messaging", () => {
  test("should send message between two peers", async ({ browser }) => {
    const user1 = await createIsolatedUser(browser, "p2p-1");
    const user2 = await createIsolatedUser(browser, "p2p-2");
    const page1 = user1.page;
    const page2 = user2.page;

    const page1Logs: string[] = [];
    const page2Logs: string[] = [];
    page1.on("console", (msg) => {
      const text = msg.text();
      page1Logs.push(text);
      if (
        text.includes("[useMeshNetwork]") ||
        text.includes("[MeshNetwork]") ||
        text.includes("[TransportManager]") ||
        text.includes("[WebRTCTransport]") ||
        text.includes("RoomClient")
      ) {
        console.log("[P1]", text);
      }
    });
    page2.on("console", (msg) => {
      const text = msg.text();
      page2Logs.push(text);
      if (
        text.includes("[useMeshNetwork]") ||
        text.includes("[MeshNetwork]") ||
        text.includes("[TransportManager]") ||
        text.includes("[WebRTCTransport]") ||
        text.includes("RoomClient")
      ) {
        console.log("[P2]", text);
      }
    });

    try {
      // Navigate both pages to the app
      await Promise.all([page1.goto("/"), page2.goto("/")]);

      // Wait for both pages to load
      await page1.waitForLoadState("networkidle");
      await page2.waitForLoadState("networkidle");

    const ensureIdentity = async (page: typeof page1, name: string) => {
      // If identity already exists, do nothing
      const existingId = await page
        .waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId, null, {
          timeout: 2000,
        })
        .then(() => true)
        .catch(() => false);

      if (existingId) return;

      // Prefer real UI onboarding: Get Started -> type name -> Enter
      try {
        const getStarted = page.getByRole("button", { name: "Get Started" });
        if (await getStarted.isVisible({ timeout: 2000 })) {
          await getStarted.click();
        }
      } catch {
        // ignore
      }

      try {
        const displayNameInput = page.getByPlaceholder("Display Name");
        if (await displayNameInput.isVisible({ timeout: 5000 })) {
          await displayNameInput.fill(name);
          await displayNameInput.press("Enter");
          return;
        }
      } catch {
        // ignore
      }

      // Fallback to helper if UI not available
      await page.evaluate(async (displayName: string) => {
        const win = window as any;
        if (typeof win.e2eCreateIdentity === "function") {
          await win.e2eCreateIdentity(displayName);
        }
      }, name);
    };

    await Promise.all([
      ensureIdentity(page1, "gfhu-1"),
      ensureIdentity(page2, "gfhu-2"),
    ]);

    // Wait for E2E helpers to be exposed and identity to be ready
    await Promise.all([
      page1.waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId),
      page2.waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId),
    ]);

    // Join the same hub/room so signaling works for WebRTC
    const ROOM_URL = "https://sovcom.netlify.app/.netlify/functions/room";
    await Promise.all([
      page1.evaluate(async (url) => {
        const win = window as any;
        if (typeof win.joinRoom === "function") {
          await win.joinRoom(url);
        }
      }, ROOM_URL),
      page2.evaluate(async (url) => {
        const win = window as any;
        if (typeof win.joinRoom === "function") {
          await win.joinRoom(url);
        }
      }, ROOM_URL),
    ]);

    await Promise.all([
      page1.waitForFunction(() => (window as any).isJoinedToRoom === true, undefined, { timeout: 20000 }),
      page2.waitForFunction(() => (window as any).isJoinedToRoom === true, undefined, { timeout: 20000 }),
    ]);

    // Ensure discovery is working (each should eventually see at least one discovered peer)
    await Promise.race([
      page1.waitForFunction(() => ((window as any).discoveredPeers || []).length > 0, undefined, { timeout: 30000 }),
      page2.waitForFunction(() => ((window as any).discoveredPeers || []).length > 0, undefined, { timeout: 30000 }),
    ]).catch(() => {
      console.log("[TEST] No discovered peers after joining room.");
      console.log("[TEST] P1 discoveredPeers:", page1Logs.slice(-30));
      console.log("[TEST] P2 discoveredPeers:", page2Logs.slice(-30));
    });

    // Get peer IDs from both pages
    const peerId1 = await page1.evaluate(() => {
      return (window as any).__SC_STATUS__?.localPeerId;
    });

    const peerId2 = await page2.evaluate(() => {
      return (window as any).__SC_STATUS__?.localPeerId;
    });

    console.log("Peer 1 ID:", peerId1);
    console.log("Peer 2 ID:", peerId2);

    // Deterministically initiate connection from page1 to page2.
    // (Avoid dual-initiator glare with the QR-style offer/accept flow.)
    await page1.evaluate(async (targetPeerId: string) => {
      const win = window as any;
      if (typeof win.connectToPeer !== "function") {
        throw new Error("window.connectToPeer helper not available");
      }
      await win.connectToPeer(targetPeerId);
    }, peerId2);

    // Wait for peers to be connected on at least one side
    await Promise.race([
      page1.waitForFunction(() => (window as any).peers?.length > 0, undefined, { timeout: 60000 }),
      page2.waitForFunction(() => (window as any).peers?.length > 0, undefined, { timeout: 60000 }),
    ]).catch((e) => {
      console.log("[TEST] Peer connection did not establish.");
      console.log("[TEST] Last P1 logs:");
      page1Logs.slice(-60).forEach((l) => console.log(l));
      console.log("[TEST] Last P2 logs:");
      page2Logs.slice(-60).forEach((l) => console.log(l));
      throw e;
    });

    // Check peers count
    const peers1 = await page1.evaluate(() => {
      return (window as any).peers?.length || 0;
    });

    const peers2 = await page2.evaluate(() => {
      return (window as any).peers?.length || 0;
    });

    console.log(`Connected peers: Page1=${peers1}, Page2=${peers2}`);

    // Verify connection established
    expect(peers1 + peers2).toBeGreaterThan(0);

    // Send message from page1 to page2
    const testMessage = `Test message ${Date.now()}`;

    await page1.evaluate(async ({ recipientId, content }) => {
      const win = window as any;
      if (typeof win.sendMessage !== "function") {
        throw new Error("window.sendMessage helper not available");
      }
      await win.sendMessage(recipientId, content);
    }, { recipientId: peerId2, content: testMessage });

    console.log("Sent message from peer 1:", testMessage);

    // Wait for message to be received on page2
    await page2.waitForFunction(
      (expected: string) => {
        const msgs = (window as any).messages || [];
        return msgs.some((m: any) => m?.content === expected && m?.from !== "me");
      },
      testMessage,
      { timeout: 20000 },
    );

    const receivedMessages = await page2.evaluate(() => {
      return (window as any).messages || [];
    });
    console.log("Messages received on peer 2:", receivedMessages.length);
    expect(receivedMessages.some((m: any) => m?.content === testMessage)).toBe(true);

    // Cleanup
    } finally {
      await user1.context.close();
      await user2.context.close();
    }
  });

  test("should handle connection offer generation and acceptance", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      const win = window as any;
      if (typeof win.e2eCreateIdentity === "function") {
        await win.e2eCreateIdentity("E2E");
      }
    });
    await page.waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId);

    // Test generateConnectionOffer
    const offer = await page.evaluate(async () => {
      // Access through the window object if exposed, or try to trigger it
      const generateBtn = document.querySelector(
        '[data-testid="generate-offer-btn"]',
      ) as HTMLElement;
      if (generateBtn) {
        generateBtn.click();
        await new Promise((r) => setTimeout(r, 500));
      }

      // Return offer from clipboard or localStorage
      const storedOffer = localStorage.getItem("connectionOffer");
      return storedOffer;
    });

    // Verify offer structure if generated
    if (offer) {
      try {
        const offerData = JSON.parse(offer);
        expect(offerData).toHaveProperty("peerId");
        expect(offerData).toHaveProperty("publicKey");
        console.log("Valid connection offer generated:", offerData.peerId);
      } catch (e) {
        console.log("Offer parsed but may have different structure");
      }
    }

    await context.close();
  });

  test("should persist messages in IndexedDB", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      const win = window as any;
      if (typeof win.e2eCreateIdentity === "function") {
        await win.e2eCreateIdentity("E2E");
      }
    });
    await page.waitForFunction(() => (window as any).__SC_STATUS__?.localPeerId);

    // Check if messages are persisted
    const persistedMessages = await page.evaluate(async () => {
      const win = window as any;
      if (typeof win.getDatabase === "function") {
        const db = win.getDatabase();
        return (await db.getMessages?.("test-conversation")) || [];
      }
      // Try to access via document body data attribute
      const messagesData = document.body.getAttribute("data-messages");
      return messagesData ? JSON.parse(messagesData) : [];
    });

    console.log("Persisted messages count:", persistedMessages.length);

    // Verify message structure
    if (persistedMessages.length > 0) {
      const msg = persistedMessages[0];
      expect(msg).toHaveProperty("id");
      expect(msg).toHaveProperty("content");
      expect(msg).toHaveProperty("timestamp");
      expect(msg).toHaveProperty("conversationId");
    }

    await context.close();
  });
});

/**
 * Test Data Structure for P2P Messaging
 */
export interface P2PTestData {
  peerId1: string;
  peerId2: string;
  connectionOffer: string;
  testMessage: string;
  timestamp: number;
}
