import { test, expect, chromium } from '@playwright/test';

/**
 * Cross-Origin Mesh Connectivity Test
 * 
 * Tests that peers from different origins (production + local) can connect
 * and exchange messages through the mesh network.
 */
test.describe('Cross-Origin Mesh Connectivity', () => {
  test('Connect production and local peers via mesh network', async () => {
    const PRODUCTION_URL = 'https://sovcom.netlify.app';
    const LOCAL_URL = 'http://localhost:3002';
    
    console.log('=== Cross-Origin Mesh Connectivity Test ===');
    console.log(`Production: ${PRODUCTION_URL}`);
    console.log(`Local: ${LOCAL_URL}`);
    
    // Launch two browsers
    const browser1 = await chromium.launch({ headless: false }); // Production
    const browser2 = await chromium.launch({ headless: false }); // Local
    
    const context1 = await browser1.newContext();
    const context2 = await browser2.newContext();
    
    const pageProd = await context1.newPage();
    const pageLocal = await context2.newPage();
    
    const logsProd: string[] = [];
    const logsLocal: string[] = [];
    
    // Capture console logs
    pageProd.on('console', msg => {
      const text = msg.text();
      logsProd.push(text);
      if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
          text.includes('TransportManager') || text.includes('WebRTC') ||
          text.includes('MESSAGE') || text.includes('Room')) {
        console.log('[PROD]', text);
      }
    });
    
    pageLocal.on('console', msg => {
      const text = msg.text();
      logsLocal.push(text);
      if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
          text.includes('TransportManager') || text.includes('WebRTC') ||
          text.includes('MESSAGE') || text.includes('Room')) {
        console.log('[LOCAL]', text);
      }
    });

    // Navigate to both
    console.log('\n=== Navigating to both origins ===');
    await Promise.all([
      pageProd.goto(PRODUCTION_URL),
      pageLocal.goto(LOCAL_URL)
    ]);
    
    await pageProd.waitForTimeout(3000);
    await pageLocal.waitForTimeout(3000);

    // Complete onboarding on production
    console.log('\n=== Completing onboarding on PRODUCTION ===');
    await completeOnboarding(pageProd, 'ProdUser');
    
    // Complete onboarding on local
    console.log('\n=== Completing onboarding on LOCAL ===');
    await completeOnboarding(pageLocal, 'LocalUser');

    // Wait for mesh network initialization
    console.log('\n=== Waiting for mesh network initialization ===');
    await pageProd.waitForTimeout(5000);
    await pageLocal.waitForTimeout(5000);

    // Get peer IDs
    const peerIdProd = await getPeerId(pageProd);
    const peerIdLocal = await getPeerId(pageLocal);
    
    console.log(`\nPeer IDs:`);
    console.log(`  Production: ${peerIdProd}`);
    console.log(`  Local: ${peerIdLocal}`);

    // Both should join the public room to discover each other
    console.log('\n=== Joining public room on both ===');
    
    // Try to find and click public room button
    await joinPublicRoom(pageProd);
    await joinPublicRoom(pageLocal);
    
    // Wait for peer discovery
    console.log('\n=== Waiting for peer discovery (30s) ===');
    await pageProd.waitForTimeout(30000);

    // Check connected peers
    const connectedProd = await getConnectedPeers(pageProd);
    const connectedLocal = await getConnectedPeers(pageLocal);
    
    console.log(`\nConnected peers:`);
    console.log(`  Production: ${JSON.stringify(connectedProd)}`);
    console.log(`  Local: ${JSON.stringify(connectedLocal)}`);

    // Check discovered peers
    const discoveredProd = await getDiscoveredPeers(pageProd);
    const discoveredLocal = await getDiscoveredPeers(pageLocal);
    
    console.log(`\nDiscovered peers:`);
    console.log(`  Production: ${JSON.stringify(discoveredProd)}`);
    console.log(`  Local: ${JSON.stringify(discoveredLocal)}`);

    // Try sending a message if peers are connected
    if (peerIdLocal && peerIdLocal !== 'unknown' && (connectedProd.length > 0 || discoveredProd.length > 0)) {
      console.log('\n=== Attempting to send message from PRODUCTION to LOCAL ===');
      const testMessage = `Cross-origin test ${Date.now()}`;
      
      const sendResult = await sendMessage(pageProd, peerIdLocal, testMessage);
      console.log(`Send result: ${JSON.stringify(sendResult)}`);
      
      // Wait for message delivery
      await pageLocal.waitForTimeout(5000);
      
      // Check if message was received
      const received = await checkReceivedMessages(pageLocal, testMessage);
      console.log(`Message received: ${received}`);
    }

    // Print relevant logs
    console.log('\n=== PRODUCTION Mesh Logs (last 30) ===');
    logsProd.filter(l => 
      l.includes('MeshNetwork') || l.includes('MessageRelay') || 
      l.includes('TransportManager') || l.includes('Room')
    ).slice(-30).forEach(l => console.log(l));
    
    console.log('\n=== LOCAL Mesh Logs (last 30) ===');
    logsLocal.filter(l => 
      l.includes('MeshNetwork') || l.includes('MessageRelay') || 
      l.includes('TransportManager') || l.includes('Room')
    ).slice(-30).forEach(l => console.log(l));

    // Cleanup
    await browser1.close();
    await browser2.close();
  });
});

async function completeOnboarding(page: any, userName: string): Promise<void> {
  // Step 1: Welcome screen
  const getStartedBtn = page.locator('button:has-text("Get Started")');
  if (await getStartedBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`[${userName}] Clicking Get Started`);
    await getStartedBtn.click();
    await page.waitForTimeout(1500);
  }

  // Step 2: Identity screen
  const nameInput = page.locator('input[placeholder="Display Name"]');
  if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log(`[${userName}] Filling display name`);
    await nameInput.fill(userName);
    await page.waitForTimeout(500);
    
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextBtn.click();
      console.log(`[${userName}] Clicked Next - waiting for key generation`);
      await page.waitForTimeout(4000);
    }
  }

  // Skip through remaining screens
  for (let i = 0; i < 5; i++) {
    const skipBtn = page.locator('button:has-text("Next"), button:has-text("Skip"), button:has-text("Start Messaging"), button:has-text("Done"), button:has-text("Finish")').first();
    if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      const btnText = await skipBtn.textContent();
      console.log(`[${userName}] Clicking: ${btnText}`);
      await skipBtn.click();
      await page.waitForTimeout(800);
    }
  }
  
  console.log(`[${userName}] Onboarding complete`);
}

async function getPeerId(page: any): Promise<string> {
  return await page.evaluate(() => {
    const w = window as any;
    const network = w.__meshNetwork || w.meshNetwork;
    if (network?.getLocalPeerId) {
      return network.getLocalPeerId() || 'unknown';
    }
    // Try from status
    if (w.__SC_STATUS__?.localPeerId) {
      return w.__SC_STATUS__.localPeerId;
    }
    return 'unknown';
  });
}

async function getConnectedPeers(page: any): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as any;
    const network = w.__meshNetwork || w.meshNetwork;
    if (network?.getConnectedPeers) {
      const peers = network.getConnectedPeers() || [];
      return peers.map((p: any) => typeof p === 'string' ? p : p?.id || '');
    }
    return [];
  });
}

async function getDiscoveredPeers(page: any): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as any;
    if (w.__SC_STATUS__?.discoveredPeers) {
      return w.__SC_STATUS__.discoveredPeers;
    }
    return [];
  });
}

async function joinPublicRoom(page: any): Promise<void> {
  // Look for public room button or it might auto-join
  const publicRoomBtn = page.locator('button:has-text("Public"), button:has-text("Room"), [data-testid="public-room"]').first();
  if (await publicRoomBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Clicking Public Room button');
    await publicRoomBtn.click();
    await page.waitForTimeout(2000);
  } else {
    console.log('No Public Room button found - may auto-join');
  }
}

async function sendMessage(page: any, recipientId: string, message: string): Promise<any> {
  return await page.evaluate(async ({ recipientId, message }: { recipientId: string, message: string }) => {
    const w = window as any;
    const network = w.__meshNetwork || w.meshNetwork;
    
    if (!network) {
      return { success: false, error: 'No mesh network' };
    }
    
    try {
      const payload = JSON.stringify({
        text: message,
        timestamp: Date.now()
      });
      
      console.log(`[TEST] Sending message to ${recipientId}: ${message}`);
      await network.sendMessage(recipientId, payload);
      console.log(`[TEST] Message sent successfully`);
      return { success: true };
    } catch (e: any) {
      console.error(`[TEST] Send failed:`, e);
      return { success: false, error: e.message };
    }
  }, { recipientId, message });
}

async function checkReceivedMessages(page: any, expectedContent: string): Promise<boolean> {
  // Check if message appears in UI or logs
  const messageElement = page.locator(`text="${expectedContent}"`);
  if (await messageElement.isVisible({ timeout: 2000 }).catch(() => false)) {
    return true;
  }
  
  // Check console logs for received message
  return await page.evaluate((content: string) => {
    const w = window as any;
    if (w.__receivedMessages) {
      return w.__receivedMessages.some((m: any) => 
        m.content?.includes(content) || m.text?.includes(content)
      );
    }
    return false;
  }, expectedContent);
}
