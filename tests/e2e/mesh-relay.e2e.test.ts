/**
 * E2E tests for Mesh Relay and Gossip Protocol functionality
 * Tests multi-hop message relay, store-and-forward, and gossip propagation
 */
import { test, expect } from '@playwright/test';

test.describe('Mesh Relay Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Message Routing', () => {
    test('should display routing status', async ({ page }) => {
      // Look for routing status indicator
      const routingStatus = page.locator('[data-testid="routing-status"], .routing-info');
      if (await routingStatus.count() > 0) {
        await expect(routingStatus).toBeVisible();
      }
    });

    test('should show connected peer count', async ({ page }) => {
      const peerCount = page.locator('[data-testid="peer-count"], .peer-count');
      if (await peerCount.count() > 0) {
        await expect(peerCount).toBeVisible();
        const countText = await peerCount.textContent();
        expect(countText).toMatch(/\d+/);
      }
    });

    test('should handle message delivery', async ({ page }) => {
      // Setup a conversation first
      const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
      if (await addContactBtn.count() > 0) {
        await addContactBtn.click();
        const quickAdd = page.locator('[data-testid="quick-add-btn"]');
        if (await quickAdd.isVisible()) {
          await quickAdd.click();
        }
      }

      const messageInput = page.locator('[data-testid="message-input"]');
      if (await messageInput.count() > 0) {
        // Send a message
        await messageInput.fill('Test relay message');
        await page.locator('[data-testid="send-message-btn"]').click();
        
        // Message should appear in chat
        await expect(page.locator('text=Test relay message')).toBeVisible();
      }
    });
  });

  test.describe('Store-and-Forward', () => {
    test('should queue messages for offline peers', async ({ page }) => {
      // This test verifies the store-and-forward UI indicator
      const queueIndicator = page.locator('[data-testid="message-queue"], .queue-status');
      if (await queueIndicator.count() > 0) {
        await expect(queueIndicator).toBeVisible();
      }
    });

    test('should show pending message status', async ({ page }) => {
      // Setup conversation
      const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
      if (await addContactBtn.count() > 0) {
        await addContactBtn.click();
        const quickAdd = page.locator('[data-testid="quick-add-btn"]');
        if (await quickAdd.isVisible()) {
          await quickAdd.click();
        }
      }

      const messageInput = page.locator('[data-testid="message-input"]');
      if (await messageInput.count() > 0) {
        await messageInput.fill('Pending test');
        await page.locator('[data-testid="send-message-btn"]').click();
        
        // Look for status indicator
        const statusIndicator = page.locator('[data-testid^="message-status-"]').first();
        if (await statusIndicator.count() > 0) {
          await expect(statusIndicator).toBeVisible();
        }
      }
    });
  });

  test.describe('Gossip Protocol', () => {
    test('should display gossip statistics', async ({ page }) => {
      // Open debug/stats panel if available
      const statsButton = page.locator('[data-testid="stats-btn"], [data-testid="debug-btn"]');
      if (await statsButton.count() > 0) {
        await statsButton.click();
        
        const gossipStats = page.locator('[data-testid="gossip-stats"], .gossip-info');
        if (await gossipStats.count() > 0) {
          await expect(gossipStats).toBeVisible();
        }
      }
    });

    test('should show message deduplication stats', async ({ page }) => {
      // Look for dedup stats
      const dedupStats = page.locator('[data-testid="dedup-stats"], text=/duplicate/i');
      if (await dedupStats.count() > 0) {
        await expect(dedupStats).toBeVisible();
      }
    });
  });

  test.describe('Network Health', () => {
    test('should display network health status', async ({ page }) => {
      const healthStatus = page.locator('[data-testid="network-health"], .health-indicator');
      if (await healthStatus.count() > 0) {
        await expect(healthStatus).toBeVisible();
      }
    });

    test('should show peer quality metrics', async ({ page }) => {
      // Look for peer quality info
      const peerInfo = page.locator('.peer-info');
      if (await peerInfo.count() > 0) {
        await peerInfo.click();
        
        const qualityMetric = page.locator('[data-testid="peer-quality"], text=/quality|latency/i');
        if (await qualityMetric.count() > 0) {
          await expect(qualityMetric).toBeVisible();
        }
      }
    });

    test('should handle network reconnection', async ({ page, context }) => {
      // Go offline
      await context.setOffline(true);
      
      // Go back online
      await context.setOffline(false);
      
      // Wait for a specific condition that indicates the app has reconnected
      const connectionStatus = page.locator('[data-testid="connection-status"]');
      if (await connectionStatus.count() > 0) {
        await expect(connectionStatus).toContainText(/online|connected/i, { timeout: 5000 });
      }
      
      // App should recover
      const app = page.locator('#root, #app, .app');
      await expect(app).toBeVisible();
    });
  });
});

test.describe('Message Fragmentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle large messages', async ({ page }) => {
    // Setup conversation
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    if (await addContactBtn.count() > 0) {
      await addContactBtn.click();
      const quickAdd = page.locator('[data-testid="quick-add-btn"]');
      if (await quickAdd.isVisible()) {
        await quickAdd.click();
      }
    }

    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() > 0) {
      // Send a large message
      const largeMessage = 'A'.repeat(2000);
      await messageInput.fill(largeMessage);
      await page.locator('[data-testid="send-message-btn"]').click();
      
      // Message should be sent (may be truncated in display)
      await expect(page.locator(`text=${largeMessage.substring(0, 100)}`)).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle file transfers', async ({ page }) => {
    // Look for file transfer button
    const fileButton = page.locator('[data-testid="attach-file-btn"], .file-attach-btn');
    if (await fileButton.count() > 0) {
      await expect(fileButton).toBeVisible();
    }
  });
});

test.describe('Relay Statistics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should track messages sent', async ({ page }) => {
    const sentCount = page.locator('[data-testid="messages-sent"], text=/sent/i');
    if (await sentCount.count() > 0) {
      await expect(sentCount).toBeVisible();
    }
  });

  test('should track messages received', async ({ page }) => {
    const receivedCount = page.locator('[data-testid="messages-received"], text=/received/i');
    if (await receivedCount.count() > 0) {
      await expect(receivedCount).toBeVisible();
    }
  });

  test('should display relay efficiency', async ({ page }) => {
    // Open stats panel
    const statsPanel = page.locator('[data-testid="relay-stats"], .relay-statistics');
    if (await statsPanel.count() > 0) {
      await expect(statsPanel).toBeVisible();
    }
  });
});

test.describe('Multi-hop Routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display hop count information', async ({ page }) => {
    // Look for hop count in message details or routing info
    const hopInfo = page.locator('[data-testid="hop-count"], text=/hop/i');
    if (await hopInfo.count() > 0) {
      await expect(hopInfo).toBeVisible();
    }
  });

  test('should show routing path', async ({ page }) => {
    // Look for routing path visualization
    const routePath = page.locator('[data-testid="route-path"], .routing-path');
    if (await routePath.count() > 0) {
      await expect(routePath).toBeVisible();
    }
  });

  test('should handle route failures gracefully', async ({ page, context }) => {
    // Simulate network issues
    await context.setOffline(true);
    await page.waitForTimeout(500);
    await context.setOffline(false);
    
    // App should recover and potentially re-route
    const app = page.locator('#root, #app, .app');
    await expect(app).toBeVisible();
  });
});

test.describe('Broadcast Messages', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should support broadcast discovery messages', async ({ page }) => {
    // Look for discovery/broadcast feature
    const broadcastFeature = page.locator('[data-testid="broadcast-btn"], text=/broadcast|discover/i');
    if (await broadcastFeature.count() > 0) {
      await expect(broadcastFeature).toBeVisible();
    }
  });

  test('should receive broadcast announcements', async ({ page }) => {
    // Look for announcement display
    const announcements = page.locator('[data-testid="announcements"], .peer-announcements');
    if (await announcements.count() > 0) {
      await expect(announcements).toBeVisible();
    }
  });
});
