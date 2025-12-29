// Playwright script to extract the E2E marker from localStorage after E2E test
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  const marker = await page.evaluate(() => localStorage.getItem('sc-e2e-marker'));
  if (marker) {
    console.log('E2E MAIN MARKER:', marker);
  } else {
    console.log('No E2E main marker found in localStorage.');
  }
  await browser.close();
})();
