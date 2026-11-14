import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, '../docs/screenshots');

if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('[verifier] Launching headless Chrome via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();

  // Helper for taking screenshots at both desktop and mobile viewports
  async function captureScreenshots(name) {
    // Desktop 1280px
    await page.setViewport({ width: 1280, height: 800 });
    await new Promise((r) => setTimeout(r, 600));
    const desktopPath = path.join(screenshotsDir, `${name}-1280px.png`);
    await page.screenshot({ path: desktopPath, fullPage: false });
    console.log(`[verifier] Captured: ${desktopPath}`);

    // Mobile 390px
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 600));
    const mobilePath = path.join(screenshotsDir, `${name}-390px.png`);
    await page.screenshot({ path: mobilePath, fullPage: false });
    console.log(`[verifier] Captured: ${mobilePath}`);
  }

  try {
    // 1. Visit Login Page
    console.log('[verifier] Navigating to /admin/login...');
    await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle0' });
    await captureScreenshots('admin-login');

    // Perform Login
    console.log('[verifier] Logging in as Owner...');
    await page.setViewport({ width: 1280, height: 800 });
    await page.type('input[type="email"]', 'owner@circleuponline.com');
    await page.type('input[type="password"]', 'OwnerPassword123');
    await page.click('button[type="submit"]');

    // Wait for navigation / redirect to /admin/overview
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[verifier] Current URL after login:', page.url());

    // 2. Visit Products Page
    console.log('[verifier] Navigating to /admin/products...');
    await page.goto('http://localhost:5173/admin/products', { waitUntil: 'networkidle0' });
    await captureScreenshots('admin-products-table');

    // 3. Visit Product Form Page
    console.log('[verifier] Navigating to /admin/products/new...');
    await page.goto('http://localhost:5173/admin/products/new', { waitUntil: 'networkidle0' });
    await captureScreenshots('admin-product-form');

    // Fill in product form
    console.log('[verifier] Filling product form...');
    await page.setViewport({ width: 1280, height: 800 });
    
    // Name
    const nameInput = await page.$('input[placeholder*="Vintage"]');
    if (nameInput) {
      await nameInput.type('Vintage Linen Chore Overshirt');
    }

    // Price
    const priceInputs = await page.$$('input[type="number"]');
    if (priceInputs[0]) {
      await priceInputs[0].type('2850');
    }

    // Category selection
    await page.select('select', 'womens-upperwear').catch(() => {});

    // Save product
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      console.log('[verifier] Submitted new product form.');
      await new Promise((r) => setTimeout(r, 1500));
    }

    // 4. Visit Orders Page
    console.log('[verifier] Navigating to /admin/orders...');
    await page.goto('http://localhost:5173/admin/orders', { waitUntil: 'networkidle0' });
    await captureScreenshots('admin-orders');

    console.log('[verifier] All verification steps and screenshots completed successfully!');
  } catch (err) {
    console.error('[verifier] Error during verification:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
