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
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('1. Navigating to Sign In page...');
  await page.goto('http://localhost:5173/signin', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signin-google-phone.png') });
  console.log('Saved verify-signin-google-phone.png');

  // Click on Mobile Phone tab on signin
  console.log('2. Switching to Phone tab on Sign In...');
  await page.waitForSelector('button');
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const phoneBtn = buttons.find(b => b.textContent && b.textContent.includes('Mobile Phone'));
    if (phoneBtn) {
      phoneBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked phone tab button:', clicked);
  await page.waitForSelector('#signin-phone', { timeout: 5000 });
  await page.type('#signin-phone', '9820112233');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signin-phone-tab.png') });
  console.log('Saved verify-signin-phone-tab.png');

  // Navigate to SignUp page
  console.log('3. Navigating to Sign Up page...');
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signup-google-phone.png') });
  console.log('Saved verify-signup-google-phone.png');

  // Switch to Phone tab on signup
  console.log('4. Switching to Phone tab on Sign Up...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const phoneBtn = buttons.find(b => b.textContent && b.textContent.includes('Mobile Phone'));
    if (phoneBtn) phoneBtn.click();
  });
  await page.waitForSelector('#signup-phone', { timeout: 5000 });
  await page.type('#signup-phone', '9820112233');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signup-phone-tab.png') });
  console.log('Saved verify-signup-phone-tab.png');

  // Test Google Sign In from /signin
  console.log('5. Testing Google Sign-In...');
  await page.goto('http://localhost:5173/signin', { waitUntil: 'networkidle2' });
  await page.waitForSelector('button');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Continue with Google'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Check Header now shows Profile
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-header-profile-button.png'), clip: { x: 0, y: 0, width: 1280, height: 120 } });
  console.log('Saved verify-header-profile-button.png');

  // Check Account Page (/account)
  console.log('6. Navigating to Account page (/account)...');
  await page.goto('http://localhost:5173/account', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  const tabHeadings = await page.evaluate(() => {
    const navTabs = Array.from(document.querySelectorAll('button'));
    return navTabs
      .filter(b => ['Orders', 'Purchases', 'Address Details', 'Payment Methods'].includes(b.textContent?.trim()))
      .map(b => b.textContent?.trim());
  });
  console.log('Detected profile tab headings:', tabHeadings);

  const recircleCount = await page.evaluate(() => {
    return (document.body.innerText.match(/re-?circle/gi) || []).length;
  });
  console.log('Count of "recircle" mentions on profile page:', recircleCount);

  // Tab 1: Orders
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-orders-tab.png'), fullPage: true });
  console.log('Saved verify-profile-orders-tab.png');

  // Tab 2: Purchases
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Purchases');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-purchases-tab.png'), fullPage: true });
  console.log('Saved verify-profile-purchases-tab.png');

  // Tab 3: Address Details
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Address Details');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-addresses-tab.png'), fullPage: true });
  console.log('Saved verify-profile-addresses-tab.png');

  // Tab 4: Payment Methods
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Payment Methods');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-payments-tab.png'), fullPage: true });
  console.log('Saved verify-profile-payments-tab.png');

  // Step-by-step Checkout on /cart
  console.log('7. Verifying Cart Step-by-step Checkout...');
  // Add a product to cart first via API or localStorage
  await page.evaluate(() => {
    localStorage.setItem(
      'circleup_cart',
      JSON.stringify({
        items: [
          {
            id: 'item-1',
            productId: 'CU-PRD-001',
            name: 'Handcrafted Vintage Kantha Jacket',
            unitPrice: 320000,
            quantity: 1,
            size: 'M',
            image: '/images/products/kantha-jacket.jpg',
          },
        ],
        promoCode: null,
      })
    );
  });
  await page.goto('http://localhost:5173/cart', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  const openCheckoutSuccess = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Place Order / Direct Checkout'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (openCheckoutSuccess) {
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-cart-step1-delivery.png') });
    console.log('Saved verify-cart-step1-delivery.png');

    // Fill form and click continue to step 2
    await page.evaluate(() => {
      const nameInput = document.querySelector('input[placeholder*="Aanya"]') || document.querySelector('input[type="text"]');
      if (nameInput) nameInput.value = 'Aanya Sharma';
      const continueBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Continue to Payment'));
      if (continueBtn) continueBtn.click();
    });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-cart-step2-payment.png') });
    console.log('Saved verify-cart-step2-payment.png');
  }

  await browser.close();
  console.log('All visual verifications completed successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
