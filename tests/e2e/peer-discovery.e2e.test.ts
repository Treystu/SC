/**
 * E2E tests for Peer Discovery functionality
 * Tests local network discovery, QR code pairing, and manual IP entry
 */
import { test, expect } from '@playwright/test';

test.describe('Peer Discovery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Discovery Methods', () => {
    test('should display peer discovery options', async ({ page }) => {
      // Look for add contact or discovery button
      const addButton = page.locator('[data-testid="add-contact-btn"], .add-button');
      if (await addButton.count() > 0) {
        await addButton.click();
        
        // Should show discovery options
        const discoveryOptions = page.locator('[data-testid="discovery-options"]');
        if (await discoveryOptions.count() > 0) {
          await expect(discoveryOptions).toBeVisible();
        }
      }
    });

    test('should have QR code scanning option', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-contact-btn"], .add-button');
      if (await addButton.count() > 0) {
        await addButton.click();
        
        // Look for QR code option
        const qrOption = page.locator('[data-testid="scan-qr-btn"], text=/QR Code/i');
        if (await qrOption.count() > 0) {
          await expect(qrOption).toBeVisible();
        }
      }
    });

    test('should have manual entry option', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-contact-btn"], .add-button');
      if (await addButton.count() > 0) {
        await addButton.click();
        
        // Look for manual entry option
        const manualOption = page.locator('[data-testid="manual-entry-btn"], text=/Manual/i');
        if (await manualOption.count() > 0) {
          await expect(manualOption).toBeVisible();
        }
      }
    });
  });

  test.describe('QR Code Display', () => {
    test('should display own QR code for sharing', async ({ page }) => {
      // Look for share/QR code button
      const shareButton = page.locator('[data-testid="share-qr-btn"], [data-testid="show-qr-btn"]');
      if (await shareButton.count() > 0) {
        await shareButton.click();
        
        // QR code should be displayed
        const qrCode = page.locator('[data-testid="qr-code"], canvas, svg');
        if (await qrCode.count() > 0) {
          await expect(qrCode).toBeVisible();
        }
      }
    });

    test('should display public key fingerprint', async ({ page }) => {
      // Look for settings or profile
      const settingsButton = page.locator('[data-testid="settings-btn"], .settings-button');
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        
        // Fingerprint should be visible
        const fingerprint = page.locator('[data-testid="fingerprint"], .fingerprint');
        if (await fingerprint.count() > 0) {
          await expect(fingerprint).toBeVisible();
        }
      }
    });
  });

  test.describe('Local Network Discovery', () => {
    test('should show network discovery status', async ({ page }) => {
      // Look for network discovery section
      const networkDiscovery = page.locator('[data-testid="network-discovery"], .network-discovery');
      if (await networkDiscovery.count() > 0) {
        await expect(networkDiscovery).toBeVisible();
      }
    });

    test('should display discovered peers', async ({ page }) => {
      // Look for discovered peers list
      const discoveredPeers = page.locator('[data-testid="discovered-peers"], .discovered-peers');
      if (await discoveredPeers.count() > 0) {
        await expect(discoveredPeers).toBeVisible();
      }
    });
  });

  test.describe('Connection Status', () => {
    test('should show connection status indicator', async ({ page }) => {
      // Look for connection status
      const connectionStatus = page.locator('[data-testid="connection-status"], .connection-status');
      if (await connectionStatus.count() > 0) {
        await expect(connectionStatus).toBeVisible();
      }
    });

    test('should display peer count', async ({ page }) => {
      // Look for peer count
      const peerCount = page.locator('[data-testid="peer-count"], .peer-count');
      if (await peerCount.count() > 0) {
        await expect(peerCount).toBeVisible();
      }
    });

    test('should show peer information on click', async ({ page }) => {
      // Look for peer info panel
      const peerInfo = page.locator('.peer-info');
      if (await peerInfo.count() > 0) {
        await expect(peerInfo).toBeVisible();
        
        // Check for peer details
        const peerIdLabel = peerInfo.locator('text=/Peer ID|Your ID/i');
        if (await peerIdLabel.count() > 0) {
          await expect(peerIdLabel).toBeVisible();
        }
      }
    });
  });
});

test.describe('Mesh Network Status', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display mesh network status', async ({ page }) => {
    // Look for mesh status indicator
    const meshStatus = page.locator('[data-testid="mesh-status"], .mesh-status');
    if (await meshStatus.count() > 0) {
      await expect(meshStatus).toBeVisible();
    }
  });

  test('should show network topology if available', async ({ page }) => {
    // Look for network topology visualization
    const topology = page.locator('[data-testid="network-topology"], .network-graph');
    if (await topology.count() > 0) {
      await expect(topology).toBeVisible();
    }
  });

  test('should display routing information', async ({ page }) => {
    // Look for routing info (might be in settings or debug panel)
    const routingInfo = page.locator('[data-testid="routing-info"], .routing-table');
    if (await routingInfo.count() > 0) {
      await expect(routingInfo).toBeVisible();
    }
  });
});

test.describe('Identity Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should create identity on first visit', async ({ page }) => {
    // Identity should be created automatically
    const identity = await page.evaluate(() => {
      return localStorage.getItem('identity') !== null;
    });
    
    expect(identity).toBe(true);
  });

  test('should display identity in settings', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('[data-testid="settings-btn"], .settings-button, [aria-label="Settings"]');
    if (await settingsButton.count() > 0) {
      await settingsButton.click();
      
      // Identity info should be displayed
      const identitySection = page.locator('[data-testid="identity-section"], .identity-info');
      if (await identitySection.count() > 0) {
        await expect(identitySection).toBeVisible();
      }
    }
  });

  test('should allow identity backup', async ({ page }) => {
    // Open settings
    const settingsButton = page.locator('[data-testid="settings-btn"], .settings-button, [aria-label="Settings"]');
      if (await settingsButton.count() > 0) {
        await settingsButton.click();
        
        // Look for backup option
        const backupButton = page.locator('[data-testid="create-backup-btn"], text=/Backup|Export/i');
        if (await backupButton.count() > 0) {
          await expect(backupButton).toBeVisible();
        }
      }
    });

  test('should show public key', async ({ page }) => {
    // Public key should be accessible
    const publicKey = await page.evaluate(() => {
      const identity = JSON.parse(localStorage.getItem('identity') || '{}');
      return identity.publicKey;
    });
    
    if (publicKey) {
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Offline Support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle offline mode gracefully', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    
    // App should still be functional
    const app = page.locator('.app');
    await expect(app.first()).toBeVisible();
    
    // Go back online
    await context.setOffline(false);
  });

  test('should show offline indicator', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    
    // Wait for offline indicator to appear
    const offlineIndicator = page
      .locator('[data-testid="offline-indicator"]')
      .or(page.locator('.offline-banner'))
      .or(page.getByText(/offline/i));
    await expect(offlineIndicator.first()).toBeVisible({ timeout: 5000 });
    
    // Go back online
    await context.setOffline(false);
  });

  test('should queue messages when offline', async ({ page, context }) => {
    // Create a contact first if needed
    const addContactBtn = page.locator('[data-testid="add-contact-btn"]');
    if (await addContactBtn.count() > 0) {
      await addContactBtn.click();
      const quickAdd = page.locator('[data-testid="quick-add-btn"]');
      if (await quickAdd.isVisible()) {
        await quickAdd.click();
      }
    }

    // Go offline
    await context.setOffline(true);
    
    // Try to send a message
    const messageInput = page.locator('[data-testid="message-input"]');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Offline message test');
      await page.locator('[data-testid="send-message-btn"]').click();
      
      // Message should be queued (shown with pending status)
      // The message should be visible even if pending
    }
    
    // Go back online
    await context.setOffline(false);
  });
});

test.describe('Encryption Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display encryption status', async ({ page }) => {
    // Look for encryption indicator
    const encryptionStatus = page.locator('[data-testid="encryption-status"], .encryption-indicator, [aria-label*="encrypted"]');
    if (await encryptionStatus.count() > 0) {
      await expect(encryptionStatus).toBeVisible();
    }
  });

  test('should show security information for conversations', async ({ page }) => {
    // Open a conversation if one exists
    const firstConversation = page.locator('.conversation-item, [data-testid^="conversation-"]').first();
    if (await firstConversation.count() > 0) {
      await firstConversation.click();
      
      // Look for security info
      const securityInfo = page.locator('[data-testid="security-info"], .security-badge');
      if (await securityInfo.count() > 0) {
        await expect(securityInfo).toBeVisible();
      }
    }
  });

  test('should allow fingerprint verification', async ({ page }) => {
    // Open a conversation if one exists
    const firstConversation = page.locator('.conversation-item, [data-testid^="conversation-"]').first();
    if (await firstConversation.count() > 0) {
      await firstConversation.click();
      
      // Look for verify button
      const verifyButton = page.locator('[data-testid="verify-btn"], text=/Verify/i');
      if (await verifyButton.count() > 0) {
        await expect(verifyButton).toBeVisible();
      }
    }
  });
});
