import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E tests
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  globalSetup: require.resolve("./tests/e2e/playwright.global-setup.js"),
  globalTeardown: require.resolve("./tests/e2e/playwright.global-teardown.js"),
  testDir: "./tests",
  testMatch: [
    "**/*.e2e.test.ts",
    "**/*.e2e.spec.ts",
    "**/cross-platform.e2e.test.ts",
  ],

  /* Maximum time one test can run for */
  timeout: 60 * 1000,

  /* Test timeout for expect() */
  expect: {
    timeout: 10000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter to use */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/junit.xml" }],
    ["list"],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.BASE_URL || "http://localhost:3001",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on first retry */
    video: "retain-on-failure",

    /* Clear local storage before each test */
    storageState: undefined,
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: process.env.CI
      ? "npx vite preview --outDir web/dist --port 3001 --strictPort"
      : "npm run dev -- --port 3001 --strictPort",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
