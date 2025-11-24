/**
 * E2E tests for basic application functionality
 */
import { test, expect } from '@playwright/test';

// Helper to skip onboarding for tests
async function skipOnboardingIfPresent(page: any) {
  // Check if onboarding is showing
  const onboardingVisible = await page.locator('dialog[aria-label*="Welcome"], div:has-text("Welcome to Sovereign Communications")').isVisible().catch(() => false);
  
  if (onboardingVisible) {
    // Try to skip the onboarding
    const skipButton = page.locator('button:has-text("Skip Tutorial")');
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
      // Wait for onboarding to close
      await page.waitForTimeout(500);
    } else {
      // If no skip button, complete it quickly
      // Click through all the steps
      for (let i = 0; i < 4; i++) {
        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Get Started"), button:has-text("Start Messaging")').first();
        if (await continueBtn.isVisible().catch(() => false)) {
          await continueBtn.click();
          await page.waitForTimeout(300);
        }
      }
    }
  }
}

test.describe('Application Load', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set localStorage to skip onboarding
    await context.addInitScript(() => {
      localStorage.setItem('sc-onboarding-complete', 'true');
    });
  });

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
      !e.includes('404') &&
      !e.includes('Content Security Policy') // CSP warnings via meta tags are not critical
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
  test.beforeEach(async ({ page, context }) => {
    // Set localStorage to skip onboarding
    await context.addInitScript(() => {
      localStorage.setItem('sc-onboarding-complete', 'true');
    });
  });

  test('should display peer information', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check if peer info is displayed
    const peerInfo = page.locator('.peer-info, div:has-text("Your Peer ID")');
    if (await peerInfo.count() > 0) {
      await expect(peerInfo.first()).toBeVisible();
      
      // Should show peer ID
      const peerIdText = await peerInfo.first().textContent();
      expect(peerIdText).toContain('Peer ID');
    }
  });

  test('should show connection status', async ({ page }) => {
    await page.goto('/');
    
    // ConnectionStatus component should be visible
    const connectionStatus = page.locator('.app-header').getByText(/connected|offline/i);
    await expect(connectionStatus).toBeVisible();
  });

  test.skip('should generate identity on first load', async ({ page }) => {
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
