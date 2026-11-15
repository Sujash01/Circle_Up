import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

function findChromePath() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of commonPaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const ARTIFACT_DIR = 'C:/Users/HP/.gemini/antigravity/brain/f6fa651d-22ef-4429-96fb-e930c5727d8b';

async function run() {
  const executablePath = findChromePath();
  if (!executablePath) {
    console.error('Chrome executable not found');
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1280, height: 1100 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('1. Navigating to Product Detail Page...');
  await page.goto('http://localhost:5173/product/washed-camp-collar-linen-shirt', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  // Screenshot product detail actions
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-product-detail-whatsapp.png'),
    fullPage: false,
  });
  console.log('Saved verify-product-detail-whatsapp.png');

  // Click Add to Cart
  console.log('2. Adding item to cart...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const addBtn = buttons.find(b => b.textContent && b.textContent.includes('Add to Cart'));
    if (addBtn) addBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Navigate to Cart
  console.log('3. Navigating to Cart Page...');
  await page.goto('http://localhost:5173/cart', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-cart-whatsapp.png'),
    fullPage: false,
  });
  console.log('Saved verify-cart-whatsapp.png');

  // Open Checkout Modal
  console.log('4. Opening Direct Checkout Modal...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const checkoutBtn = buttons.find(b => b.textContent && b.textContent.includes('Place Order / Direct Checkout'));
    if (checkoutBtn) checkoutBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Verify dropdown is NOT present
  const hasSelectDropdown = await page.evaluate(() => {
    return document.querySelectorAll('select').length > 0;
  });
  console.log('Does checkout modal have select dropdown?:', hasSelectDropdown);

  // Capture modal screenshot
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-checkout-modal-two-options.png'),
    fullPage: false,
  });
  console.log('Saved verify-checkout-modal-two-options.png');

  await browser.close();
  console.log('Done verification!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
