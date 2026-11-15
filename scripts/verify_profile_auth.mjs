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

  console.log('2. Testing Google Sign-In...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.includes('Continue with Google'));
    if (btn) btn.click();
  });

  await new Promise(r => setTimeout(r, 1200));

  console.log('3. Navigating to Account page (/account)...');
  await page.goto('http://localhost:5173/account', { waitUntil: 'networkidle2' });

  // Verify tab headings
  const tabHeadings = await page.evaluate(() => {
    const navTabs = Array.from(document.querySelectorAll('div.border-b button'));
    return navTabs.map(b => b.textContent?.trim());
  });
  console.log('Detected profile tab headings:', tabHeadings);

  // Check for any recircle references
  const recircleCount = await page.evaluate(() => {
    return (document.body.innerText.match(/re-?circle/gi) || []).length;
  });
  console.log('Count of "recircle" mentions on profile page:', recircleCount);

  // Screenshot Tab 1: Orders
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-orders-tab.png'), fullPage: true });
  console.log('Saved verify-profile-orders-tab.png');

  // Click on "Purchases" tab
  console.log('4. Clicking Purchases tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Purchases');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-purchases-tab.png'), fullPage: true });
  console.log('Saved verify-profile-purchases-tab.png');

  // Click on "Address Details" tab
  console.log('5. Clicking Address Details tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Address Details');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-addresses-tab.png'), fullPage: true });
  console.log('Saved verify-profile-addresses-tab.png');

  // Click on "Payment Methods" tab
  console.log('6. Clicking Payment Methods tab...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent && b.textContent.trim() === 'Payment Methods');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'verify-profile-payments-tab.png'), fullPage: true });
  console.log('Saved verify-profile-payments-tab.png');

  await browser.close();
  console.log('Verification finished successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
