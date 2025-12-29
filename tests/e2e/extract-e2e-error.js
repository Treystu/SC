// Playwright script to extract fatal error from localStorage after E2E test
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  const error = await page.evaluate(() => localStorage.getItem('sc-e2e-fatal-error'));
  if (error) {
    console.log('E2E FATAL ERROR:', error);
  } else {
    console.log('No E2E fatal error found in localStorage.');
  }
  await browser.close();
})();
