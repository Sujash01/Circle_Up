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

  // Capture Step 1 screenshot
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-checkout-step1.png'),
    fullPage: false,
  });
  console.log('Saved verify-checkout-step1.png');

  // Fill in Step 1 Delivery details
  console.log('5. Filling in delivery form details...');
  await page.evaluate(() => {
    const nameInput = document.querySelector('input[placeholder*="Sharma"]');
    const emailInput = document.querySelector('input[placeholder*="aanya@example.com"]');
    const phoneInput = document.querySelector('input[placeholder*="+91 98201"]');
    const addressInput = document.querySelector('input[placeholder*="House/Flat No"]');
    const cityInput = document.querySelector('input[placeholder*="Mumbai"]');
    const stateInput = document.querySelector('input[placeholder*="Maharashtra"]');
    const pinInput = document.querySelector('input[placeholder*="400050"]');

    function setVal(el, val) {
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setVal(nameInput, 'Aanya Sharma');
    setVal(emailInput, 'aanya@example.com');
    setVal(phoneInput, '+91 98201 12233');
    setVal(addressInput, 'Flat 402, Vintage Chambers, Bandra West');
    setVal(cityInput, 'Mumbai');
    setVal(stateInput, 'Maharashtra');
    setVal(pinInput, '400050');
  });

  await new Promise(r => setTimeout(r, 600));

  // Advance to Step 2
  console.log('6. Clicking Continue to Payment...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const contBtn = buttons.find(b => b.textContent && b.textContent.includes('Continue to Payment'));
    if (contBtn) contBtn.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Capture Step 2 screenshot (default COD)
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-checkout-step2-cod.png'),
    fullPage: false,
  });
  console.log('Saved verify-checkout-step2-cod.png');

  // Select Pay Online (Razorpay)
  console.log('7. Selecting Pay Online option...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const onlineBtn = buttons.find(b => b.textContent && b.textContent.includes('Pay Online'));
    if (onlineBtn) onlineBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Capture Step 2 screenshot with Pay Online Razorpay selected
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'verify-checkout-step2-payonline-razorpay.png'),
    fullPage: false,
  });
  console.log('Saved verify-checkout-step2-payonline-razorpay.png');

  await browser.close();
  console.log('Done verification!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
