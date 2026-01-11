import { test, expect, chromium } from '@playwright/test';

/**
 * Simple debug test to capture message flow logs
 */
test('Debug message flow between two peers', async () => {
  const BASE_URL = 'http://localhost:3002';
  
  // Launch two browsers
  const browser1 = await chromium.launch({ headless: true });
  const browser2 = await chromium.launch({ headless: true });
  
  const context1 = await browser1.newContext();
  const context2 = await browser2.newContext();
  
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  
  const logs1: string[] = [];
  const logs2: string[] = [];
  
  // Capture all console logs
  page1.on('console', msg => {
    const text = msg.text();
    logs1.push(text);
    if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
        text.includes('WebRTCTransport') || text.includes('MESSAGE')) {
      console.log('[P1]', text);
    }
  });
  
  page2.on('console', msg => {
    const text = msg.text();
    logs2.push(text);
    if (text.includes('MeshNetwork') || text.includes('MessageRelay') || 
        text.includes('WebRTCTransport') || text.includes('MESSAGE')) {
      console.log('[P2]', text);
    }
  });

  // Navigate both pages
  await page1.goto(BASE_URL);
  await page2.goto(BASE_URL);
  
  // Wait for app to load
  await page1.waitForTimeout(3000);
  await page2.waitForTimeout(3000);

  // Complete onboarding on page1
  console.log('\n=== Completing onboarding on Page 1 ===');
  const getStarted1 = page1.locator('button:has-text("Get Started")');
  if (await getStarted1.isVisible({ timeout: 5000 }).catch(() => false)) {
    await getStarted1.click();
    await page1.waitForTimeout(1000);
    
    const nameInput1 = page1.locator('input[placeholder="Display Name"]');
    if (await nameInput1.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput1.fill('TestUser1');
      const nextBtn1 = page1.locator('button:has-text("Next")');
      await nextBtn1.click();
      await page1.waitForTimeout(3000);
    }
    
    // Skip through remaining screens
    for (let i = 0; i < 5; i++) {
      const skipBtn = page1.locator('button:has-text("Next"), button:has-text("Skip"), button:has-text("Start Messaging")').first();
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click();
        await page1.waitForTimeout(500);
      }
    }
  }

  // Complete onboarding on page2
  console.log('\n=== Completing onboarding on Page 2 ===');
  const getStarted2 = page2.locator('button:has-text("Get Started")');
  if (await getStarted2.isVisible({ timeout: 5000 }).catch(() => false)) {
    await getStarted2.click();
    await page2.waitForTimeout(1000);
    
    const nameInput2 = page2.locator('input[placeholder="Display Name"]');
    if (await nameInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput2.fill('TestUser2');
      const nextBtn2 = page2.locator('button:has-text("Next")');
      await nextBtn2.click();
      await page2.waitForTimeout(3000);
    }
    
    // Skip through remaining screens
    for (let i = 0; i < 5; i++) {
      const skipBtn = page2.locator('button:has-text("Next"), button:has-text("Skip"), button:has-text("Start Messaging")').first();
      if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await skipBtn.click();
        await page2.waitForTimeout(500);
      }
    }
  }

  // Wait for mesh network to initialize
  console.log('\n=== Waiting for mesh network initialization ===');
  await page1.waitForTimeout(5000);
  await page2.waitForTimeout(5000);

  // Get peer IDs
  const peerId1 = await page1.evaluate(() => {
    const w = window as any;
    return w.__meshNetwork?.getLocalPeerId?.() || w.meshNetwork?.getLocalPeerId?.() || 'unknown';
  });
  
  const peerId2 = await page2.evaluate(() => {
    const w = window as any;
    return w.__meshNetwork?.getLocalPeerId?.() || w.meshNetwork?.getLocalPeerId?.() || 'unknown';
  });

  console.log(`\nPeer IDs:\n  Page1: ${peerId1}\n  Page2: ${peerId2}`);

  // Get connected peers
  const connectedPeers1 = await page1.evaluate(() => {
    const w = window as any;
    const network = w.__meshNetwork || w.meshNetwork;
    if (network?.getConnectedPeers) {
      return network.getConnectedPeers().map((p: any) => p.id || p);
    }
    return [];
  });

  const connectedPeers2 = await page2.evaluate(() => {
    const w = window as any;
    const network = w.__meshNetwork || w.meshNetwork;
    if (network?.getConnectedPeers) {
      return network.getConnectedPeers().map((p: any) => p.id || p);
    }
    return [];
  });

  console.log(`\nConnected peers:\n  Page1: ${JSON.stringify(connectedPeers1)}\n  Page2: ${JSON.stringify(connectedPeers2)}`);

  // Try to send a message from page1 to page2
  if (peerId2 !== 'unknown') {
    console.log(`\n=== Attempting to send message from Page1 to Page2 (${peerId2}) ===`);
    
    const sendResult = await page1.evaluate(async (targetPeerId) => {
      const w = window as any;
      const network = w.__meshNetwork || w.meshNetwork;
      
      if (!network) {
        return { success: false, error: 'No mesh network found' };
      }
      
      try {
        const message = JSON.stringify({
          text: 'Hello from test!',
          timestamp: Date.now()
        });
        
        console.log(`[TEST] Calling sendMessage to ${targetPeerId}`);
        await network.sendMessage(targetPeerId, message);
        console.log(`[TEST] sendMessage completed`);
        return { success: true };
      } catch (e: any) {
        console.error(`[TEST] sendMessage failed:`, e);
        return { success: false, error: e.message };
      }
    }, peerId2);

    console.log('Send result:', sendResult);
    
    // Wait for message to be received
    await page2.waitForTimeout(5000);
  }

  // Print relevant logs
  console.log('\n=== Page 1 Mesh Logs ===');
  logs1.filter(l => l.includes('MeshNetwork') || l.includes('MessageRelay') || l.includes('WebRTCTransport')).slice(-20).forEach(l => console.log(l));
  
  console.log('\n=== Page 2 Mesh Logs ===');
  logs2.filter(l => l.includes('MeshNetwork') || l.includes('MessageRelay') || l.includes('WebRTCTransport')).slice(-20).forEach(l => console.log(l));

  // Cleanup
  await browser1.close();
  await browser2.close();
});
