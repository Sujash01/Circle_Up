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

async function verifyMobile() {
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
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });

  // Measure mobile metrics
  const metrics = await page.evaluate(() => {
    const winWidth = window.innerWidth;
    const docScrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;

    const signup = document.querySelector('.storefront-signup-cta');
    const signupRect = signup ? signup.getBoundingClientRect() : null;

    const sections = Array.from(document.querySelectorAll('.home-vine-section')).map((s) => {
      const rect = s.getBoundingClientRect();
      const style = window.getComputedStyle(s);
      return {
        id: s.id,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
      };
    });

    const overflowing = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > winWidth + 1 || rect.left < -1) {
        overflowing.push({
          tag: el.tagName,
          className: typeof el.className === 'string' ? el.className.slice(0, 40) : '',
          id: el.id,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    });

    return {
      winWidth,
      docScrollWidth,
      bodyScrollWidth,
      hasOverflow: docScrollWidth > winWidth,
      signup: signupRect
        ? {
            width: Math.round(signupRect.width),
            height: Math.round(signupRect.height),
            left: Math.round(signupRect.left),
            right: Math.round(signupRect.right),
          }
        : null,
      sectionsSample: sections.slice(0, 3),
      overflowingCount: overflowing.length,
      overflowingSample: overflowing.slice(0, 5),
    };
  });

  console.log('Mobile Metrics:', JSON.stringify(metrics, null, 2));

  // Take screenshot of mobile hero
  await page.screenshot({
    path: path.join(screenshotsDir, 'verify-mobile-hero-fixed.png'),
    fullPage: false,
  });

  // Scroll to Ready-To-Wear
  await page.evaluate(() => {
    const rtw = document.querySelector('#ready-to-wear');
    if (rtw) rtw.scrollIntoView();
  });
  await new Promise((r) => setTimeout(r, 400));

  await page.screenshot({
    path: path.join(screenshotsDir, 'verify-mobile-rtw-fixed.png'),
    fullPage: false,
  });

  await browser.close();
  console.log('Verification completed and screenshots saved.');
}

verifyMobile().catch((err) => {
  console.error(err);
  process.exit(1);
});

