import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const base = new URL(process.env.STAGE4B_BROWSER_URL || 'http://127.0.0.1:5174');
assert.ok(['127.0.0.1', 'localhost'].includes(base.hostname), 'Run this fixture against local Vite only.');
const chrome = process.env.STAGE4B_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const screenshots = process.env.STAGE4B_SCREENSHOTS || 'audit-report/stage4b';
await mkdir(screenshots, { recursive: true });

const stamp = '2026-11-25T09:00:00Z';
const id = '3534b775-cfa9-41f8-9e58-74d87a2e1d2b';
const profile = { id, email: 'owner@example.test', name: 'Fixture Owner', role: 'owner' };
const rent = {
  id, name: 'Fixture Rental', slug: 'fixture-rental', category: 'rentals', image: '/assets/rtw-3.webp',
  rentalPrice3Days: 4321, rentalPrice7Days: 9123, rentalPrice14Days: 19000, securityDeposit: 2345,
  condition: 'Mint', size: 'M', isAvailable: true, description: 'Fixture', updatedAt: stamp,
};
const booking = {
  id, productName: rent.name, customerName: 'Fixture Customer', customerPhone: '+919111111111',
  size: 'M', startDate: '2026-12-01', endDate: '2026-12-07', durationDays: 7, rentalFeePaise: 9123,
  securityDepositPaise: 2345, totalPaise: 11468, status: 'REQUESTED', createdAt: stamp,
};
const inquiry = {
  id, name: 'Fixture Contact', email: 'contact@example.test', phone: null, subject: 'Fixture inquiry',
  message: 'Fixture inquiry text.', category: 'general', status: 'NEW', notes: null, reply: null,
  repliedAt: null, createdAt: stamp, updatedAt: stamp,
};
const customer = {
  id, name: 'Fixture Customer', email: 'customer@example.test', phone: '+919111111111', totalOrders: 1,
  totalSpendInPaise: 120000, tier: 'REGULAR', city: 'Chandigarh',
};
const defaultOrder = {
  id, orderNumber: 'ORD-FIXTURE-12345678', customer: { name: customer.name, email: customer.email, phone: customer.phone },
  shippingAddress: { addressLine: 'Fixture Lane', city: 'Chandigarh', state: 'Chandigarh', postalCode: '160001', country: 'India' },
  items: [{ name: 'Fixture Piece', serialNumber: 'FIXTURE01', quantity: 1, price: 120000 }],
  subtotal: 120000, discount: 0, deliveryFee: 0, totalAmount: 120000, status: 'CONFIRMED',
  paymentStatus: 'PAID', paymentMethod: 'CASH_ON_DELIVERY', createdAt: stamp,
};
const defaultSettings = {
  announcementText: 'Fixture announcement', announcementLink: '/new-arrivals', isAnnouncementActive: true,
  marqueePhrases: ['Fixture ticker'], categoryTiles: [], customDrop: { enabled: false, label: 'Archive' },
  storeAddress: 'Fixture Address', contactPhone: '', contactEmail: 'store@example.test',
  whatsappNumber: '+916280746336', isWhatsappVerified: false, contentVersion: 1,
};
const meta = { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false };

async function visibleText(page, value) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), { timeout: 10000 }, value);
}

async function button(page, label) {
  await page.waitForFunction((label) => [...document.querySelectorAll('button')].some(
    (node) => node.offsetWidth && !node.disabled && node.textContent.trim() === label,
  ), { timeout: 10000 }, label);
  const handle = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find(
    (node) => node.offsetWidth && !node.disabled && node.textContent.trim() === label,
  ), label);
  await handle.asElement().click();
  await handle.dispose();
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
try {
  for (const [viewport, size] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844, isMobile: true }]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport(size);
    await page.evaluateOnNewDocument(() => {
      const Audio = window.AudioContext;
      window.stage4bAudio = [];
      window.AudioContext = class extends Audio {
        constructor(...args) {
          super(...args);
          window.stage4bAudio.push(this);
        }
      };
    });
    await page.setRequestInterception(true);
    let settings = { ...defaultSettings };
    const order = { ...defaultOrder };
    let currentBooking = { ...booking };
    let currentInquiry = { ...inquiry };
    let rejectFirstCancellation = true;
    let lastSettingsPatch;
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.origin !== base.origin && ['http:', 'https:'].includes(url.protocol)) return void req.abort();
      if (!url.pathname.includes('/api/')) return void req.continue();
      const endpoint = url.pathname.replace(/^\/api(?:\/v1)?/, '');
      const method = req.method();
      const payload = req.postData() ? JSON.parse(req.postData()) : {};
      const json = (data, status = 200) => req.respond({
        status, contentType: 'application/json', body: JSON.stringify(status < 400 ? { success: true, data, meta } : { error: data }),
      });
      const reject = (message, code = 'FIXTURE_ERROR', status = 503) => json({ message, code }, status);
      if (endpoint === '/admin/auth/me') return void json({ user: profile, csrfToken: 'fixture-csrf' });
      if (endpoint === '/admin/overview') return void json({ metrics: {
        totalOrdersCount: 1, liveProductsCount: 0, lowStockCount: 0, activeOrdersCount: order.status === 'CANCELLED' ? 0 : 1,
        totalRevenuePaise: order.status === 'CANCELLED' ? 0 : 120000,
      }, recentOrders: [order] });
      if (endpoint === '/admin/settings') {
        if (method === 'PUT') {
          lastSettingsPatch = payload;
          settings = { ...settings, ...payload, contentVersion: settings.contentVersion + 1 };
        }
        return void json(settings);
      }
      if (endpoint === '/admin/orders') return void json([order]);
      if (endpoint.endsWith('/cancel')) {
        assert.equal(req.headers()['x-csrf-token'], 'fixture-csrf');
        assert.equal(payload.reason, 'Customer requested cancellation.');
        if (rejectFirstCancellation) {
          rejectFirstCancellation = false;
          return void reject('Administrator password is incorrect.', 'INVALID_PASSWORD', 401);
        }
        return void json({ order, outcome: 'INVENTORY_REVIEW', refundRequired: true });
      }
      if (endpoint === '/admin/customers') return void json([customer]);
      if (endpoint.startsWith('/admin/customers/')) return void json({
        customer, orders: [order], sustainabilityImpact: { garmentsSaved: 1, co2AvoidedKg: 0.2, waterSavedLitres: 10 },
        savedAddresses: [], marketingPreferences: { email: false, whatsapp: false },
      });
      if (endpoint === '/admin/inquiries') return void json([currentInquiry]);
      if (endpoint.startsWith('/admin/inquiries/')) {
        if (method === 'PATCH') currentInquiry = { ...currentInquiry, ...payload };
        return void json(currentInquiry);
      }
      if (endpoint === '/admin/rentals' || endpoint === '/rentals') return void json([rent]);
      if (endpoint === '/admin/rental-bookings') return void json([currentBooking]);
      if (endpoint.startsWith('/admin/rental-bookings/')) {
        currentBooking = { ...currentBooking, ...payload };
        return void json(currentBooking);
      }
      if (endpoint === '/admin/events') return void reject('Events unavailable in fixture.');
      if (endpoint === '/admin/users') return void json([profile]);
      return void json([]);
    });

    const open = (route) => page.goto(new URL(route, base).href, { waitUntil: 'networkidle0' });
    const screenshot = (name) => page.screenshot({ path: path.join(screenshots, `${viewport}-${name}.png`), fullPage: true });

    await open('/admin/rentals');
    await visibleText(page, 'Fixture Rental');
    assert.equal(await page.evaluate(() => window.stage4bAudio.length), 0);
    await button(page, 'Rental Bookings');
    await page.waitForSelector('details summary');
    await page.click('details summary');
    await visibleText(page, 'Fixture Customer');
    await button(page, 'Mark confirmed');
    await visibleText(page, 'CONFIRMED');
    await screenshot('rental-bookings');
    await button(page, 'Community Events (0)');
    await visibleText(page, 'Events unavailable in fixture.');

    await open('/admin/inquiries');
    await visibleText(page, 'Fixture inquiry');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((node) => node.textContent.includes('Fixture inquiry')).click());
    await visibleText(page, 'Fixture inquiry text.');
    await screenshot('inquiries');

    await open('/admin/customers');
    await visibleText(page, 'Fixture Customer');
    await page.evaluate(() => {
      const row = document.querySelector('tbody tr');
      (row?.querySelector('button') || row)?.click();
    });
    await visibleText(page, 'ORD-FIXTURE-12345678');
    await screenshot('customers');

    await open('/admin/settings');
    await page.waitForSelector('#business-whatsapp');
    await page.evaluate(() => {
      const checkbox = [...document.querySelectorAll('input[type=checkbox]')].find((input) =>
        input.parentElement.textContent.toLowerCase().includes('verified'));
      checkbox.click();
    });
    await button(page, 'Save All Settings');
    await visibleText(page, 'Site settings saved.');
    assert.deepEqual(lastSettingsPatch, { whatsappNumber: '+916280746336', isWhatsappVerified: true, contentVersion: 1 });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#business-whatsapp');
    assert.equal(await page.$eval('#business-whatsapp', (input) => input.value), '+916280746336');
    await screenshot('settings');

    await open('/admin/orders');
    await visibleText(page, order.orderNumber);
    const eye = await page.waitForSelector('button[title*="detail" i], button[aria-label*="detail" i]');
    await eye.click();
    await button(page, 'Request Cancellation Review');
    await page.waitForSelector('dialog[open]');
    await screenshot('cancel-order');
    await page.type('textarea[name=reason]', 'Customer requested cancellation.');
    await page.type('input[name=password]', 'wrong-fixture-password');
    await button(page, 'Confirm request');
    await visibleText(page, 'Administrator password is incorrect.');
    await page.type('input[name=password]', 'fixture-password');
    await button(page, 'Confirm request');
    await visibleText(page, 'Inventory review recorded in Activity Log. The order and stock await reconciliation.');
    assert.equal(order.paymentStatus, 'PAID');

    for (const route of ['overview', 'products', 'products/new', 'collections', 'coupons', 'account', 'activity']) {
      await open(`/admin/${route}`);
      assert.equal(await page.evaluate(() => window.stage4bAudio.length), 0, route);
    }
    await open('/');
    await page.waitForSelector('[aria-label="CircleUp Vinyl Background Music Player"]');
    await page.waitForFunction(() => window.stage4bAudio.some((context) => context.state === 'running'));
    // A client-side navigation exercises cleanup without relying on page teardown.
    await page.evaluate(() => {
      history.pushState(null, '', '/admin/overview');
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await page.waitForFunction(() => !document.querySelector('[aria-label="CircleUp Vinyl Background Music Player"]')
      && window.stage4bAudio.every((context) => context.state !== 'running'));
    await page.mouse.click(20, 20);
    assert.equal(await page.evaluate(() => window.stage4bAudio.some((context) => context.state === 'running')), false);
    assert.deepEqual(errors, [], `${viewport} page errors`);
    console.log(`${viewport}: rental bookings, inquiry details, customer orders, settings, cancellation and audio passed`);
    await context.close();
  }
} finally {
  await browser.close();
}
