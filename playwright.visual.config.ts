import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Playwright configuration for visual regression tests
 */
export default defineConfig({
  ...baseConfig,
  testMatch: ['**/*.visual.test.ts', '**/*.visual.spec.ts'],
  
  /* Use only chromium for visual tests to ensure consistency */
  projects: [
    {
      name: 'chromium',
      use: {
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  
  use: {
    ...baseConfig.use,
    screenshot: 'on',
  },
  
  /* Visual regression specific settings */
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
});
