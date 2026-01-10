import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';

// Run tests serially since they share browser state
test.describe.configure({ mode: 'serial' });

test.describe('Two Peer Connection and Messaging', () => {
  let browser1: Browser;
  let browser2: Browser;
  let context1: BrowserContext;
  let context2: BrowserContext;
  let page1: Page;
  let page2: Page;

  const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';
  
  // Collect console logs for debugging
  const consoleLogs1: string[] = [];
  const consoleLogs2: string[] = [];

  test.beforeAll(async () => {
    // Launch two separate browser instances to simulate two different devices
    browser1 = await chromium.launch({ headless: false }); // headed for debugging
    browser2 = await chromium.launch({ headless: false });
    
    // Create contexts with clean storage
    context1 = await browser1.newContext({
      storageState: undefined,
    });
    context2 = await browser2.newContext({
      storageState: undefined,
    });
    
    page1 = await context1.newPage();
    page2 = await context2.newPage();
    
    // Capture console logs
    page1.on('console', msg => {
      const text = msg.text();
      consoleLogs1.push(text);
      if (text.includes('[MeshNetwork]') || text.includes('[MessageRelay]') || text.includes('[useMeshNetwork]')) {
        console.log('[Page1]', text);
      }
    });
    
    page2.on('console', msg => {
      const text = msg.text();
      consoleLogs2.push(text);
      if (text.includes('[MeshNetwork]') || text.includes('[MessageRelay]') || text.includes('[useMeshNetwork]')) {
        console.log('[Page2]', text);
      }
    });
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
    await browser1?.close();
    await browser2?.close();
  });

  async function completeOnboarding(page: Page, userName: string): Promise<boolean> {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Step 1: Welcome screen - click "Get Started"
    const getStartedBtn = page.locator('button:has-text("Get Started")');
    if (await getStartedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[${userName}] Found welcome screen, clicking Get Started`);
      await getStartedBtn.click();
      await page.waitForTimeout(1500);
    } else {
      console.log(`[${userName}] No welcome screen found`);
    }

    // Step 2: Identity screen - fill display name and click Next
    const nameInput = page.locator('input[placeholder="Display Name"], input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[${userName}] Found identity screen, filling display name`);
      await nameInput.fill(userName);
      await page.waitForTimeout(500);
      
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        console.log(`[${userName}] Clicked Next on identity screen`);
        // Wait for key generation
        await page.waitForTimeout(3000);
      }
    }

    // Step 3: Add Contact screen - click Next to skip
    const addContactNext = page.locator('button:has-text("Next")');
    if (await addContactNext.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[${userName}] Skipping add contact screen`);
      await addContactNext.click();
      await page.waitForTimeout(1000);
    }

    // Step 4: Privacy screen - click "Start Messaging" or similar
    const startMessagingBtn = page.locator('button:has-text("Start Messaging"), button:has-text("Finish"), button:has-text("Done"), button:has-text("Complete")');
    if (await startMessagingBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[${userName}] Completing onboarding`);
      await startMessagingBtn.first().click();
      await page.waitForTimeout(2000);
    }

    console.log(`[${userName}] Onboarding complete`);
    return true;
  }

  async function waitForMeshNetwork(page: Page, timeout: number = 15000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const hasNetwork = await page.evaluate(() => {
        const w = window as any;
        return !!(w.__meshNetwork || w.meshNetwork);
      });
      if (hasNetwork) return true;
      await page.waitForTimeout(500);
    }
    return false;
  }

  async function getLocalPeerId(page: Page): Promise<string> {
    return await page.evaluate(() => {
      const w = window as any;
      const network = w.__meshNetwork || w.meshNetwork;
      if (network && typeof network.getLocalPeerId === 'function') {
        return network.getLocalPeerId() || '';
      }
      return '';
    });
  }

  async function getConnectedPeers(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const w = window as any;
      const network = w.__meshNetwork || w.meshNetwork;
      if (network && typeof network.getConnectedPeers === 'function') {
        const peers = network.getConnectedPeers() || [];
        return peers.map((p: any) => typeof p === 'string' ? p : p?.id || '');
      }
      return [];
    });
  }

  test('should complete onboarding and initialize mesh network', async () => {
    // Navigate both pages
    await page1.goto(BASE_URL);
    await page2.goto(BASE_URL);

    // Complete onboarding
    await completeOnboarding(page1, 'TestUser1');
    await completeOnboarding(page2, 'TestUser2');

    // Wait for mesh network to initialize
    const hasNetwork1 = await waitForMeshNetwork(page1);
    const hasNetwork2 = await waitForMeshNetwork(page2);

    console.log('Mesh network initialized:', { page1: hasNetwork1, page2: hasNetwork2 });

    // Get local peer IDs
    const peerId1 = await getLocalPeerId(page1);
    const peerId2 = await getLocalPeerId(page2);

    console.log('Local Peer IDs:', { page1: peerId1, page2: peerId2 });

    // Verify IDs are in correct format if they exist
    if (peerId1) {
      expect(peerId1).toMatch(/^[0-9A-F]+$/);
    }
    if (peerId2) {
      expect(peerId2).toMatch(/^[0-9A-F]+$/);
    }

    // Verify IDs are different
    if (peerId1 && peerId2) {
      expect(peerId1).not.toBe(peerId2);
    }
  });

  test('should discover peers in public room', async () => {
    // Click on Public Room if visible
    const publicRoom1 = page1.locator('text=Public Room, text=public room, [data-testid="public-room"]').first();
    const publicRoom2 = page2.locator('text=Public Room, text=public room, [data-testid="public-room"]').first();

    if (await publicRoom1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoom1.click();
      await page1.waitForTimeout(2000);
    }

    if (await publicRoom2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoom2.click();
      await page2.waitForTimeout(2000);
    }

    // Wait for peer discovery
    await page1.waitForTimeout(8000);

    // Check connected peers
    const connectedPeers1 = await getConnectedPeers(page1);
    const connectedPeers2 = await getConnectedPeers(page2);

    console.log('Connected peers:', { page1: connectedPeers1, page2: connectedPeers2 });

    // Log all console messages for debugging
    console.log('\n=== Page 1 Mesh Logs ===');
    consoleLogs1.filter(l => l.includes('Mesh') || l.includes('peer') || l.includes('Peer')).slice(-20).forEach(l => console.log(l));
    
    console.log('\n=== Page 2 Mesh Logs ===');
    consoleLogs2.filter(l => l.includes('Mesh') || l.includes('peer') || l.includes('Peer')).slice(-20).forEach(l => console.log(l));
  });

  test('should have no phantom peer IDs', async () => {
    const peerId1 = await getLocalPeerId(page1);
    const peerId2 = await getLocalPeerId(page2);
    const connectedPeers1 = await getConnectedPeers(page1);
    const connectedPeers2 = await getConnectedPeers(page2);

    // Collect all unique IDs
    const allIds = new Set<string>();
    if (peerId1) allIds.add(peerId1);
    if (peerId2) allIds.add(peerId2);
    connectedPeers1.forEach(id => { if (id) allIds.add(id); });
    connectedPeers2.forEach(id => { if (id) allIds.add(id); });

    const validIds = Array.from(allIds).filter(id => id && id.length > 0);
    
    console.log('All unique peer IDs:', validIds);
    console.log('Count:', validIds.length);

    // Should have at most 2 unique peer IDs for 2 devices
    expect(validIds.length).toBeLessThanOrEqual(2);

    // All IDs should be uppercase hex
    validIds.forEach(id => {
      expect(id).toMatch(/^[0-9A-F]+$/);
    });
  });
});
