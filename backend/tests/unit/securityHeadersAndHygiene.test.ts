import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Security Headers, SEO Hygiene, and Migration Ordering (P1-12, P3-1 through P3-6)', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  it('enforces comprehensive security headers in root vercel.json', () => {
    const vercelJsonPath = path.join(rootDir, 'vercel.json');
    expect(fs.existsSync(vercelJsonPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
    expect(Array.isArray(config.headers)).toBe(true);

    const globalHeaders = config.headers.find((h: any) => h.source === '/(.*)');
    expect(globalHeaders).toBeDefined();

    const headerKeys = globalHeaders.headers.map((h: any) => h.key);
    expect(headerKeys).toContain('Content-Security-Policy');
    expect(headerKeys).toContain('Strict-Transport-Security');
    expect(headerKeys).toContain('X-Frame-Options');
    expect(headerKeys).toContain('X-Content-Type-Options');
    expect(headerKeys).toContain('Referrer-Policy');
    expect(headerKeys).toContain('Permissions-Policy');

    const csp = globalHeaders.headers.find((h: any) => h.key === 'Content-Security-Policy').value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");

    const hsts = globalHeaders.headers.find((h: any) => h.key === 'Strict-Transport-Security').value;
    expect(hsts).toContain('max-age=');

    const frameOptions = globalHeaders.headers.find((h: any) => h.key === 'X-Frame-Options').value;
    expect(frameOptions).toBe('DENY');
  });

  it('enforces noindex and no-store headers on private app routes in vercel.json', () => {
    const vercelJsonPath = path.join(rootDir, 'vercel.json');
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    const privateHeaders = config.headers.find((h: any) => h.source.includes('admin'));
    expect(privateHeaders).toBeDefined();

    const robotsTag = privateHeaders.headers.find((h: any) => h.key === 'X-Robots-Tag');
    expect(robotsTag).toBeDefined();
    expect(robotsTag.value).toContain('noindex');

    const cacheControl = privateHeaders.headers.find((h: any) => h.key === 'Cache-Control');
    expect(cacheControl).toBeDefined();
    expect(cacheControl.value).toContain('no-store');
  });

  it('enforces disallow rules for private routes in robots.txt', () => {
    const robotsPath = path.join(rootDir, 'frontend/public/robots.txt');
    expect(fs.existsSync(robotsPath)).toBe(true);

    const robotsTxt = fs.readFileSync(robotsPath, 'utf8');
    expect(robotsTxt).toContain('Disallow: /admin');
    expect(robotsTxt).toContain('Disallow: /account');
    expect(robotsTxt).toContain('Disallow: /cart');
    expect(robotsTxt).toContain('Disallow: /checkout');
    expect(robotsTxt).toContain('Disallow: /api');
    expect(robotsTxt).toContain('Sitemap: https://circleuponline.com/sitemap.xml');
  });

  it('includes legal pages and excludes private routes in sitemap.xml', () => {
    const sitemapPath = path.join(rootDir, 'frontend/public/sitemap.xml');
    expect(fs.existsSync(sitemapPath)).toBe(true);

    const sitemapXml = fs.readFileSync(sitemapPath, 'utf8');
    expect(sitemapXml).toContain('https://circleuponline.com/privacy-policy');
    expect(sitemapXml).toContain('https://circleuponline.com/terms');
    expect(sitemapXml).toContain('https://circleuponline.com/returns-refunds');
    expect(sitemapXml).toContain('https://circleuponline.com/shipping-policy');

    expect(sitemapXml).not.toContain('https://circleuponline.com/admin');
    expect(sitemapXml).not.toContain('https://circleuponline.com/account');
    expect(sitemapXml).not.toContain('https://circleuponline.com/cart');
  });

  it('ensures zero legacy database references exist in application source, migrations, and tools', () => {
    const backendOrderService = fs.readFileSync(
      path.join(rootDir, 'backend/src/modules/orders/order.service.ts'),
      'utf8',
    );
    expect(backendOrderService).not.toMatch(/mongodb|mongoose|models\/Order/i);

    const inquiriesMigration = fs.readFileSync(
      path.join(rootDir, 'supabase/migrations/20261123_inquiries_and_storage.sql'),
      'utf8',
    );
    expect(inquiriesMigration).not.toMatch(/mongodb|mongoose/i);

    const cutoverPlan = fs.readFileSync(
      path.join(rootDir, 'docs/production-database-migration-plan.md'),
      'utf8',
    );
    expect(cutoverPlan).not.toMatch(/mongodb|mongoose|atlas/i);
  });

  it('orders the four 20261115 migrations cleanly and records execution chronology', () => {
    const migrationsDir = path.join(rootDir, 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.startsWith('20261115'));

    expect(files).toEqual([
      '20261115_create_products_schema.sql',
      '20261115_create_profiles.sql',
      '20261115_fix_rls_policies.sql',
      '20261115_remove_auto_confirm.sql',
    ]);

    const readmePath = path.join(migrationsDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const readme = fs.readFileSync(readmePath, 'utf8');
    expect(readme).toContain('20261115_create_products_schema.sql');
    expect(readme).toContain('20261115_create_profiles.sql');
    expect(readme).toContain('20261115_fix_rls_policies.sql');
    expect(readme).toContain('20261115_remove_auto_confirm.sql');
  });

  it('reconciles the 45-row CSV and notes the 3 additional showcase pieces in documentation', () => {
    const csvPath = path.join(rootDir, 'circleup_final_45_products.csv');
    const csvLines = fs.readFileSync(csvPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(csvLines.length - 1).toBe(45);

    const docPath = path.join(rootDir, 'docs/CATALOG_RECONCILIATION.md');
    expect(fs.existsSync(docPath)).toBe(true);
    const doc = fs.readFileSync(docPath, 'utf8');
    expect(doc).toContain('45 data rows');
    expect(doc).toContain('48 products');
    expect(doc).toContain('retro-gum-sole-court-trainers');
  });
});
