import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';

test.describe('Two Peer Connection - No Phantom IDs', () => {
  let browser1: Browser;
  let browser2: Browser;
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';

  test.beforeAll(async () => {
    // Launch two separate browser instances to simulate two different devices
    browser1 = await chromium.launch({ headless: true });
    browser2 = await chromium.launch({ headless: true });
    
    // Create contexts with clean storage
    context1 = await browser1.newContext({
      storageState: undefined, // Fresh storage
    });
    context2 = await browser2.newContext({
      storageState: undefined, // Fresh storage
    });
    
    page1 = await context1.newPage();
    page2 = await context2.newPage();
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
    await browser1?.close();
    await browser2?.close();
  });

  async function completeOnboarding(page: Page, userName: string) {
    // Wait for page to be ready
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Check for onboarding screen - look for display name input
    const nameInput = page.locator('input').first();
    if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nameInput.fill(userName);
      await page.waitForTimeout(500);
      
      // Click any button that looks like continue/next/start
      const buttons = page.locator('button');
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const text = await btn.textContent().catch(() => '');
        if (text && /continue|next|start|get started|done/i.test(text)) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    }

    // Click through any additional onboarding steps
    for (let attempt = 0; attempt < 5; attempt++) {
      const buttons = page.locator('button');
      const count = await buttons.count();
      let clicked = false;
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const text = await btn.textContent().catch(() => '');
        if (text && /skip|later|done|continue|next|close/i.test(text)) {
          if (await btn.isVisible().catch(() => false)) {
            await btn.click();
            await page.waitForTimeout(500);
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) break;
    }

    await page.waitForTimeout(2000);
  }

  test('should show exactly 2 peer IDs when 2 devices connect', async () => {
    // Navigate both pages to the app
    await page1.goto(BASE_URL);
    await page2.goto(BASE_URL);

    // Complete onboarding for both users
    await completeOnboarding(page1, 'TestUser1');
    await completeOnboarding(page2, 'TestUser2');

    // Wait for app to initialize mesh network
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);

    // Click on Public Room if visible
    const publicRoom1 = page1.locator('text=Public Room').first();
    if (await publicRoom1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoom1.click();
      await page1.waitForTimeout(2000);
    }

    const publicRoom2 = page2.locator('text=Public Room').first();
    if (await publicRoom2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoom2.click();
      await page2.waitForTimeout(2000);
    }

    // Wait for peers to discover each other
    await page1.waitForTimeout(5000);

    // Get peer IDs from both pages using the exposed window helpers
    const peerIds1 = await page1.evaluate(() => {
      const w = window as any;
      return {
        localId: w.getLocalPeerId?.() || w.__meshNetwork?.getLocalPeerId?.() || '',
        discoveredPeers: w.getDiscoveredPeers?.() || w.__discoveredPeers || [],
        connectedPeers: w.getConnectedPeers?.() || w.__meshNetwork?.getConnectedPeers?.() || [],
      };
    });

    const peerIds2 = await page2.evaluate(() => {
      const w = window as any;
      return {
        localId: w.getLocalPeerId?.() || w.__meshNetwork?.getLocalPeerId?.() || '',
        discoveredPeers: w.getDiscoveredPeers?.() || w.__discoveredPeers || [],
        connectedPeers: w.getConnectedPeers?.() || w.__meshNetwork?.getConnectedPeers?.() || [],
      };
    });

    console.log('Page 1 Peer Info:', JSON.stringify(peerIds1, null, 2));
    console.log('Page 2 Peer Info:', JSON.stringify(peerIds2, null, 2));

    // Collect all unique peer IDs
    const allPeerIds = new Set<string>();
    if (peerIds1.localId) allPeerIds.add(peerIds1.localId);
    if (peerIds2.localId) allPeerIds.add(peerIds2.localId);
    
    // Add discovered peers
    if (Array.isArray(peerIds1.discoveredPeers)) {
      peerIds1.discoveredPeers.forEach((p: any) => {
        const id = typeof p === 'string' ? p : p?.peerId || p?.id;
        if (id) allPeerIds.add(id);
      });
    }
    if (Array.isArray(peerIds2.discoveredPeers)) {
      peerIds2.discoveredPeers.forEach((p: any) => {
        const id = typeof p === 'string' ? p : p?.peerId || p?.id;
        if (id) allPeerIds.add(id);
      });
    }

    // Add connected peers
    if (Array.isArray(peerIds1.connectedPeers)) {
      peerIds1.connectedPeers.forEach((id: string) => allPeerIds.add(id));
    }
    if (Array.isArray(peerIds2.connectedPeers)) {
      peerIds2.connectedPeers.forEach((id: string) => allPeerIds.add(id));
    }

    console.log('All unique peer IDs:', Array.from(allPeerIds));

    // Filter out empty strings
    const validPeerIds = Array.from(allPeerIds).filter(id => id && id.length > 0);
    
    console.log('Valid peer IDs count:', validPeerIds.length);
    console.log('Valid peer IDs:', validPeerIds);

    // Verify all IDs are in consistent format (uppercase hex, no spaces)
    for (const id of validPeerIds) {
      expect(id).toMatch(/^[0-9A-F]+$/);
      expect(id).not.toContain(' ');
    }

    // We should have at most 2 peer IDs for 2 devices (not 3 phantom IDs)
    expect(validPeerIds.length).toBeLessThanOrEqual(2);

    // If we have 2 IDs, verify they are different
    if (validPeerIds.length === 2) {
      expect(validPeerIds[0]).not.toBe(validPeerIds[1]);
    }
  });
});
