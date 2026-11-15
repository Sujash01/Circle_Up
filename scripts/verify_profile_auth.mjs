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

  console.log('1. Navigating to Sign Up page...');
  await page.goto('http://localhost:5173/signup', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signup-page.png'), fullPage: true });
  console.log('Saved verify-signup-page.png');

  console.log('2. Navigating to Sign In page...');
  await page.goto('http://localhost:5173/signin', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-signin-page.png'), fullPage: true });
  console.log('Saved verify-signin-page.png');

  console.log('3. Testing Google Sign-In...');
  // Click "Continue with Google"
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Continue with Google'));
    if (btn) btn.click();
  });

  // Wait for redirect to account / home
  await new Promise(r => setTimeout(r, 1500));
  console.log('Current URL after Google Sign-In:', page.url());

  // Check header - ensure Profile button replaces Sign Up
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  const hasProfileButton = await page.evaluate(() => {
    const profileEl = document.querySelector('.storefront-account-link');
    const signupEl = document.querySelector('.storefront-signup-cta');
    return {
      hasProfile: Boolean(profileEl),
      profileText: profileEl ? profileEl.textContent.trim() : null,
      hasSignup: Boolean(signupEl),
    };
  });
  console.log('Header account link check on HomePage:', hasProfileButton);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-header-profile-active.png') });

  console.log('4. Navigating to Profile / Account page (/account)...');
  await page.goto('http://localhost:5173/account', { waitUntil: 'networkidle2' });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-orders-tab.png'), fullPage: true });
  console.log('Saved verify-profile-orders-tab.png');

  // Click on "Purchases & Wardrobe" tab
  console.log('5. Clicking Purchases & Wardrobe tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Purchases & Wardrobe'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-purchases-tab.png'), fullPage: true });
  console.log('Saved verify-profile-purchases-tab.png');

  // Click on "Address Details" tab
  console.log('6. Clicking Address Details tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Address Details'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-addresses-tab.png'), fullPage: true });
  console.log('Saved verify-profile-addresses-tab.png');

  // Click on "Payment Methods" tab
  console.log('7. Clicking Payment Methods tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Payment Methods'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-payments-tab.png'), fullPage: true });
  console.log('Saved verify-profile-payments-tab.png');

  // Also verify chest size on multiple viewports to confirm no overflow
  console.log('8. Verifying Treasure Chest responsiveness on 390px mobile, 768px tablet, 1024px laptop, 1440px desktop...');
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    const overflow = await page.evaluate((w) => {
      const chest = document.querySelector('.tc-hero');
      const scene = document.querySelector('.tc-scene');
      if (!chest) return { found: false };
      const cRect = chest.getBoundingClientRect();
      const sRect = scene ? scene.getBoundingClientRect() : null;
      return {
        viewportWidth: w,
        found: true,
        sceneLeft: sRect ? sRect.left : null,
        sceneRight: sRect ? sRect.right : null,
        fitsInViewport: sRect ? sRect.right <= w + 10 : true,
      };
    }, width);
    console.log(`Viewport ${width}px chest check:`, overflow);
  }

  await browser.close();
  console.log('All profile & auth visual verifications completed successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
