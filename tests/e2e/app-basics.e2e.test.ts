/**
 * E2E tests for basic application functionality
 */
import { test, expect } from '@playwright/test';

test.describe('Application Load', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page has the correct title
    await expect(page).toHaveTitle(/Sovereign Communications/i);
  });

  test('should have responsive layout', async ({ page }) => {
    await page.goto('/');
    
    // Test different viewport sizes
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
    
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load without critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out expected/non-critical errors
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('manifest') &&
      !e.includes('404')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('should display app header with title', async ({ page }) => {
    await page.goto('/');
    
    const header = page.locator('.app-header h1');
    await expect(header).toBeVisible();
    await expect(header).toHaveText(/Sovereign Communications/i);
  });
});

test.describe('Identity Management', () => {
  test('should display peer information', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if peer info is displayed
    const peerInfo = page.locator('.peer-info');
    if (await peerInfo.count() > 0) {
      await expect(peerInfo).toBeVisible();
      
      // Should show peer ID
      const peerIdText = await peerInfo.textContent();
      expect(peerIdText).toContain('Your Peer ID');
    }
  });

  test('should show connection status', async ({ page }) => {
    await page.goto('/');
    
    // ConnectionStatus component should be visible
    const connectionStatus = page.locator('.app-header').getByText(/connected|offline/i);
    await expect(connectionStatus).toBeVisible();
  });

  test('should generate identity on first load', async ({ page }) => {
    // Clear storage
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      indexedDB.deleteDatabase('sovereign-communications');
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Check that identity was generated
    const hasIdentity = await page.evaluate(() => {
      return localStorage.getItem('identity') !== null;
    });
    
    expect(hasIdentity).toBe(true);
  });

  test('should persist identity across page reloads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get identity
    const identity1 = await page.evaluate(() => {
      return localStorage.getItem('identity');
    });
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Get identity again
    const identity2 = await page.evaluate(() => {
      return localStorage.getItem('identity');
    });
    
    expect(identity1).toBe(identity2);
  });
});

test.describe('User Interface', () => {
  test('should show welcome message when no conversation selected', async ({ page }) => {
    await page.goto('/');
    
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/Welcome to Sovereign Communications/i);
  });

  test('should display feature highlights', async ({ page }) => {
    await page.goto('/');
    
    // Check for feature sections
    const features = page.locator('.features .feature');
    await expect(features.first()).toBeVisible();
    
    // Should mention encryption
    const featuresText = await page.locator('.features').textContent();
    expect(featuresText).toMatch(/encrypted|encryption/i);
  });

  test('should have sidebar for conversations', async ({ page }) => {
    await page.goto('/');
    
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('should have main content area', async ({ page }) => {
    await page.goto('/');
    
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have skip to main content link', async ({ page }) => {
    await page.goto('/');
    
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveText(/Skip to main content/i);
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/');
    
    // Check for application role
    const app = page.locator('[role="application"]');
    await expect(app).toBeVisible();
    
    // Check for main content role
    const main = page.locator('[role="main"]');
    await expect(main).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have acceptable performance metrics', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        loadComplete: perf.loadEventEnd - perf.loadEventStart,
      };
    });
    
    // DOM content should load quickly
    expect(metrics.domContentLoaded).toBeLessThan(2000);
  });
});

test.describe('Offline Functionality', () => {
  test('should work offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Go offline
    await context.setOffline(true);
    
    // App should still be functional (it's a PWA)
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('.app-header')).toBeVisible();
    
    // Go back online
    await context.setOffline(false);
  });
});
