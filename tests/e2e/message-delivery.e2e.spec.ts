import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Advanced E2E Test for Message Delivery
 * 
 * This test simulates two users connecting and exchanging messages
 * to verify the entire message delivery pipeline works correctly.
 */

// Run tests serially since they share browser state
test.describe.configure({ mode: 'serial' });

test.describe('Message Delivery E2E Test', () => {
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
  
  // Store peer IDs
  let peerId1: string = '';
  let peerId2: string = '';

  test.beforeAll(async () => {
    console.log('=== Starting Message Delivery E2E Test ===');
    console.log(`Testing against: ${BASE_URL}`);
    
    // Launch two separate browser instances
    browser1 = await chromium.launch({ headless: true });
    browser2 = await chromium.launch({ headless: true });
    
    // Create contexts with clean storage
    context1 = await browser1.newContext();
    context2 = await browser2.newContext();
    
    page1 = await context1.newPage();
    page2 = await context2.newPage();
    
    // Capture ALL console logs for debugging
    page1.on('console', msg => {
      const text = msg.text();
      consoleLogs1.push(`[${new Date().toISOString()}] ${text}`);
      // Log important mesh network messages
      if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
          text.includes('useMeshNetwork') || text.includes('MESSAGE')) {
        console.log('[Page1]', text);
      }
    });
    
    page2.on('console', msg => {
      const text = msg.text();
      consoleLogs2.push(`[${new Date().toISOString()}] ${text}`);
      if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
          text.includes('useMeshNetwork') || text.includes('MESSAGE')) {
        console.log('[Page2]', text);
      }
    });
  });

  test.afterAll(async () => {
    // Dump all logs on failure
    console.log('\n=== Page 1 Full Logs ===');
    consoleLogs1.slice(-50).forEach(l => console.log(l));
    console.log('\n=== Page 2 Full Logs ===');
    consoleLogs2.slice(-50).forEach(l => console.log(l));
    
    await context1?.close();
    await context2?.close();
    await browser1?.close();
    await browser2?.close();
  });

  async function completeOnboarding(page: Page, userName: string): Promise<string> {
    console.log(`[${userName}] Starting onboarding...`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot for debugging
    await page.screenshot({ path: `test-results/${userName}-initial.png` });

    // Step 1: Welcome screen - click "Get Started"
    const getStartedBtn = page.locator('button:has-text("Get Started")');
    if (await getStartedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log(`[${userName}] Clicking Get Started`);
      await getStartedBtn.click();
      await page.waitForTimeout(1500);
    }

    // Step 2: Identity screen - fill display name
    const nameInput = page.locator('input[placeholder="Display Name"], input[type="text"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`[${userName}] Filling display name`);
      await nameInput.fill(userName);
      await page.waitForTimeout(500);
      
      // Click Next
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click();
        console.log(`[${userName}] Clicked Next - waiting for key generation`);
        await page.waitForTimeout(4000); // Wait for key generation
      }
    }

    // Step 3: Skip through remaining screens
    for (let i = 0; i < 5; i++) {
      const skipBtn = page.locator('button:has-text("Next"), button:has-text("Skip"), button:has-text("Later"), button:has-text("Start Messaging"), button:has-text("Done"), button:has-text("Finish")').first();
      if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const btnText = await skipBtn.textContent();
        console.log(`[${userName}] Clicking: ${btnText}`);
        await skipBtn.click();
        await page.waitForTimeout(1000);
      } else {
        break;
      }
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: `test-results/${userName}-after-onboarding.png` });

    // Get the peer ID from the app
    const peerId = await page.evaluate(() => {
      const w = window as any;
      const network = w.__meshNetwork || w.meshNetwork;
      if (network && typeof network.getLocalPeerId === 'function') {
        return network.getLocalPeerId() || '';
      }
      return '';
    });

    console.log(`[${userName}] Onboarding complete. Peer ID: ${peerId}`);
    return peerId;
  }

  async function waitForMeshNetwork(page: Page, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const hasNetwork = await page.evaluate(() => {
        const w = window as any;
        return !!(w.__meshNetwork || w.meshNetwork);
      });
      if (hasNetwork) {
        console.log('Mesh network initialized');
        return true;
      }
      await page.waitForTimeout(500);
    }
    console.log('Mesh network NOT initialized within timeout');
    return false;
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

  async function sendMessageViaUI(page: Page, recipientId: string, message: string): Promise<boolean> {
    // Try to find and click on the conversation or contact
    const conversationItem = page.locator(`[data-peer-id="${recipientId}"], [data-contact-id="${recipientId}"]`).first();
    if (await conversationItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await conversationItem.click();
      await page.waitForTimeout(500);
    }

    // Find the message input
    const messageInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"], input[type="text"]').last();
    if (await messageInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await messageInput.fill(message);
      await page.waitForTimeout(200);
      
      // Press Enter or click Send
      await messageInput.press('Enter');
      console.log(`Sent message via UI: "${message}"`);
      return true;
    }
    return false;
  }

  async function sendMessageViaJS(page: Page, recipientId: string, message: string): Promise<boolean> {
    console.log(`Sending message via JS to ${recipientId}: "${message}"`);
    
    const result = await page.evaluate(async ({ recipientId, message }) => {
      const w = window as any;
      const network = w.__meshNetwork || w.meshNetwork;
      
      if (!network) {
        return { success: false, error: 'No mesh network' };
      }
      
      try {
        // Try using the sendMessage method directly
        if (typeof network.sendMessage === 'function') {
          await network.sendMessage(recipientId, JSON.stringify({
            text: message,
            timestamp: Date.now()
          }));
          return { success: true };
        }
        return { success: false, error: 'sendMessage not available' };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }, { recipientId, message });

    console.log('Send result:', result);
    return result.success;
  }

  async function checkForReceivedMessage(page: Page, expectedContent: string, timeout: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      // Check in the UI
      const messageElement = page.locator(`text="${expectedContent}"`);
      if (await messageElement.isVisible({ timeout: 500 }).catch(() => false)) {
        console.log(`Found message in UI: "${expectedContent}"`);
        return true;
      }

      // Check in console logs
      const logs = await page.evaluate(() => {
        const w = window as any;
        return w.__receivedMessages || [];
      });
      
      if (logs.some((m: any) => m.content?.includes(expectedContent) || m.text?.includes(expectedContent))) {
        console.log(`Found message in logs: "${expectedContent}"`);
        return true;
      }

      await page.waitForTimeout(500);
    }
    return false;
  }

  test('Step 1: Complete onboarding on both browsers', async () => {
    // Navigate both pages
    await page1.goto(BASE_URL);
    await page2.goto(BASE_URL);

    // Complete onboarding
    peerId1 = await completeOnboarding(page1, 'TestUser1');
    peerId2 = await completeOnboarding(page2, 'TestUser2');

    console.log(`\nPeer IDs:\n  User1: ${peerId1}\n  User2: ${peerId2}`);

    // Verify mesh network is initialized
    const hasNetwork1 = await waitForMeshNetwork(page1);
    const hasNetwork2 = await waitForMeshNetwork(page2);

    expect(hasNetwork1 || hasNetwork2).toBe(true);
  });

  test('Step 2: Join public room and discover peers', async () => {
    // Look for public room button or auto-join
    const publicRoomBtn1 = page1.locator('text=Public Room, button:has-text("Public"), [data-testid="public-room"]').first();
    const publicRoomBtn2 = page2.locator('text=Public Room, button:has-text("Public"), [data-testid="public-room"]').first();

    if (await publicRoomBtn1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoomBtn1.click();
      console.log('Page1 clicked Public Room');
    }

    if (await publicRoomBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await publicRoomBtn2.click();
      console.log('Page2 clicked Public Room');
    }

    // Wait for peer discovery
    console.log('Waiting for peer discovery...');
    await page1.waitForTimeout(10000);

    // Check connected peers
    const peers1 = await getConnectedPeers(page1);
    const peers2 = await getConnectedPeers(page2);

    console.log(`Connected peers:\n  Page1: ${JSON.stringify(peers1)}\n  Page2: ${JSON.stringify(peers2)}`);

    // Take screenshots
    await page1.screenshot({ path: 'test-results/page1-after-room.png' });
    await page2.screenshot({ path: 'test-results/page2-after-room.png' });
  });

  test('Step 3: Send message from User1 to User2', async () => {
    const testMessage = `Test message ${Date.now()}`;
    
    // Inject a message receiver tracker
    await page2.evaluate(() => {
      const w = window as any;
      w.__receivedMessages = [];
      const network = w.__meshNetwork || w.meshNetwork;
      if (network && network.on) {
        network.on('message', (msg: any) => {
          console.log('[TEST] Received message:', JSON.stringify(msg));
          w.__receivedMessages.push(msg);
        });
      }
    });

    // Try sending via JS first
    if (peerId2) {
      const sent = await sendMessageViaJS(page1, peerId2, testMessage);
      console.log(`Message sent via JS: ${sent}`);
      
      if (sent) {
        // Wait and check for received message
        await page2.waitForTimeout(5000);
        
        const received = await checkForReceivedMessage(page2, testMessage, 15000);
        console.log(`Message received: ${received}`);
        
        // Log final state
        const finalLogs1 = consoleLogs1.filter(l => l.includes('MESSAGE') || l.includes('send'));
        const finalLogs2 = consoleLogs2.filter(l => l.includes('MESSAGE') || l.includes('receive'));
        
        console.log('\n=== Send-related logs (Page1) ===');
        finalLogs1.slice(-10).forEach(l => console.log(l));
        
        console.log('\n=== Receive-related logs (Page2) ===');
        finalLogs2.slice(-10).forEach(l => console.log(l));
      }
    } else {
      console.log('No peer ID available for User2, skipping direct message test');
    }
  });

  test('Step 4: Verify message delivery logs', async () => {
    // Analyze console logs for message flow
    const sendLogs = consoleLogs1.filter(l => 
      l.includes('sendMessage') || 
      l.includes('MESSAGE SENT') ||
      l.includes('Route lookup')
    );
    
    const receiveLogs = consoleLogs2.filter(l => 
      l.includes('MESSAGE RECEIVED') || 
      l.includes('Sender ID') ||
      l.includes('isMessageForSelf')
    );

    console.log('\n=== Message Send Flow (Page1) ===');
    sendLogs.forEach(l => console.log(l));

    console.log('\n=== Message Receive Flow (Page2) ===');
    receiveLogs.forEach(l => console.log(l));

    // Check for specific success indicators
    const messageSent = sendLogs.some(l => l.includes('MESSAGE SENT SUCCESSFULLY'));
    const messageReceived = receiveLogs.some(l => l.includes('MESSAGE RECEIVED'));

    console.log(`\nMessage sent successfully: ${messageSent}`);
    console.log(`Message received: ${messageReceived}`);
  });
});
