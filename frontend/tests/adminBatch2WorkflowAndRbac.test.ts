import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const adminDir = path.resolve(__dirname, '../src/admin');

describe('Batch 2: CRM Navigation, RBAC Consistency, Debounce & Workflow Fixes', () => {
  it('registers /admin/rentals-events and permission-guards protected routes in AdminApp.tsx', () => {
    const src = fs.readFileSync(path.join(adminDir, 'AdminApp.tsx'), 'utf8');
    expect(src).toContain('path="rentals-events"');
    expect(src).toContain('function RequirePermission');
    expect(src).toContain('permission="orders:view"');
    expect(src).toContain('permission="customers:view"');
    expect(src).toContain('permission="activity:view"');
  });

  it('aligns Overview active path, mobile Customers link, and Header route titles', () => {
    const sidebar = fs.readFileSync(path.join(adminDir, 'components/AdminSidebar.tsx'), 'utf8');
    const bottomNav = fs.readFileSync(path.join(adminDir, 'components/AdminBottomNav.tsx'), 'utf8');
    const header = fs.readFileSync(path.join(adminDir, 'components/AdminHeader.tsx'), 'utf8');

    expect(sidebar).toContain("to: '/admin/overview'");
    expect(bottomNav).toContain("to: '/admin/overview'");
    expect(bottomNav).toContain("to: '/admin/customers'");
    expect(header).toContain("'/admin/overview'");
    expect(header).toContain("'/admin/customers'");
    expect(header).toContain("'/admin/team'");
    expect(header).toContain("'/admin/inquiries'");
  });

  it('aligns ActivityLogPage, SiteSettingsPage, and TeamManagementPage permissions', () => {
    const activity = fs.readFileSync(path.join(adminDir, 'pages/ActivityLogPage.tsx'), 'utf8');
    const settings = fs.readFileSync(path.join(adminDir, 'pages/SiteSettingsPage.tsx'), 'utf8');
    const team = fs.readFileSync(path.join(adminDir, 'pages/TeamManagementPage.tsx'), 'utf8');

    expect(activity).toContain("hasPermission('activity:view')");
    expect(settings).toContain("hasPermission('settings:view')");
    expect(team).toContain("'team:manage'");
  });

  it('uses canonical inquiry statuses (IN_REVIEW, ARCHIVED) and debounces search in Orders/Inquiries/Customers', () => {
    const inquiries = fs.readFileSync(path.join(adminDir, 'pages/InquiriesPage.tsx'), 'utf8');
    const orders = fs.readFileSync(path.join(adminDir, 'pages/OrdersPage.tsx'), 'utf8');
    const customers = fs.readFileSync(path.join(adminDir, 'pages/CustomersPage.tsx'), 'utf8');
    const collections = fs.readFileSync(path.join(adminDir, 'pages/CollectionsPage.tsx'), 'utf8');

    expect(inquiries).toContain('value="IN_REVIEW"');
    expect(inquiries).toContain('value="ARCHIVED"');
    expect(inquiries).not.toContain('value="IN_PROGRESS"');
    expect(inquiries).not.toContain('value="CLOSED"');
    expect(inquiries).toContain('debouncedSearch');

    expect(orders).toContain('debouncedSearch');
    expect(orders).toContain('setTotalPages');
    expect(customers).toContain('debouncedSearch');
    expect(collections).toContain('productsLoaded');
  });

  it('removes redundant storefront initLiveSync calls from adminApi product mutations', () => {
    const adminApi = fs.readFileSync(path.join(adminDir, 'services/adminApi.ts'), 'utf8');
    expect(adminApi).not.toContain('initLiveSync');
  });
});
