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

async function verifyStorefront() {
  const executablePath = findChromePath();
  if (!executablePath) {
    console.error('Chrome executable not found');
    process.exit(1);
  }

  const screenshotsDir = path.resolve('docs/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Desktop 1280px
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  // Take screenshot of header brand specifically
  const headerBrand = await page.$('.storefront-brand');
  if (headerBrand) {
    await headerBrand.screenshot({
      path: path.join(screenshotsDir, 'storefront-header-logo-1280px.png'),
    });
    console.log('Saved storefront-header-logo-1280px.png');
  }

  // Full homepage desktop screenshot
  await page.screenshot({
    path: path.join(screenshotsDir, 'storefront-home-1280px.png'),
    fullPage: false,
  });
  console.log('Saved storefront-home-1280px.png');

  // Mobile 390px
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
  const mobileHeaderBrand = await page.$('.storefront-brand');
  if (mobileHeaderBrand) {
    await mobileHeaderBrand.screenshot({
      path: path.join(screenshotsDir, 'storefront-header-logo-390px.png'),
    });
    console.log('Saved storefront-header-logo-390px.png');
  }

  // Admin login screen check with logo
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:5173/admin/login', { waitUntil: 'networkidle2' });
  await page.screenshot({
    path: path.join(screenshotsDir, 'admin-login-with-logo.png'),
  });
  console.log('Saved admin-login-with-logo.png');

  await browser.close();
  console.log('All visual verification screenshots captured successfully.');
}

verifyStorefront().catch((err) => {
  console.error(err);
  process.exit(1);
});
