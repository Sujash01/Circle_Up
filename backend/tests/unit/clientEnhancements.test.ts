import { describe, expect, it, vi } from 'vitest';
import { productSchema, productVariantSchema } from '@circleup/shared';
import {
  IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
  refreshSessionTokenIfNeeded,
  signSessionToken,
  verifySessionToken,
  type AdminSessionData,
} from '../../src/services/adminAuth.service.js';
import { categoryController } from '../../src/controllers/category.controller.js';

vi.mock('../../src/services/supabaseCatalog.service.js', () => ({
  supabaseCatalogService: {
    getCategoryCounts: vi.fn().mockResolvedValue(new Map([['thrifted-treasure', 4]])),
  },
}));

describe('Client Enhancements: Stock > 5, 2h Session Timeout & Thrifted Treasure', () => {
  it('accepts product and variant stock quantities greater than 5 as well as 0', () => {
    const variant = productVariantSchema.parse({
      id: 'var-12',
      label: 'M',
      size: 'M',
      stock: 12,
    });
    expect(variant.stock).toBe(12);

    const product = productSchema.parse({
      id: 'prod-25',
      serialNumber: 'CU-EX-025',
      name: 'Vintage Pocket Radio',
      slug: 'vintage-pocket-radio',
      description: 'Restored retro AM/FM pocket radio',
      price: 195000,
      stock: 25,
      category: 'thrifted-treasure',
      subcategory: 'Electronics & Radio',
      productType: 'Pre-Loved',
      status: 'ACTIVE',
      images: ['https://cdn.example.com/radio.webp'],
      sizes: ['One Size'],
      variants: [{ id: 'v-1', label: 'One Size', size: 'One Size', stock: 25 }],
    });
    expect(product.stock).toBe(25);
    expect(product.productType).toBe('Pre-Loved');
  });

  it('sets admin idle timeout to 2 hours and refreshes sliding session tokens cleanly', () => {
    expect(IDLE_TIMEOUT_MS).toBe(2 * 60 * 60 * 1000);
    expect(SESSION_TTL_MS).toBeGreaterThanOrEqual(IDLE_TIMEOUT_MS);

    const now = Date.now();
    const session: AdminSessionData = {
      userId: 'admin-1',
      email: 'owner@circleup.in',
      name: 'Owner',
      role: 'owner',
      permissions: [],
      csrfToken: 'csrf-token',
      expiresAt: now + SESSION_TTL_MS,
      lastActiveAt: now - 5 * 60 * 1000,
      sessionId: 'sess-1',
    };

    const refreshed = refreshSessionTokenIfNeeded(session, now);
    expect(refreshed).not.toBeNull();
    const decoded = verifySessionToken(refreshed!.token);
    expect(decoded?.lastActiveAt).toBe(now);
    expect(decoded?.sessionId).toBe('sess-1');

    const throttled = refreshSessionTokenIfNeeded({ ...session, lastActiveAt: now - 10_000 }, now);
    expect(throttled).toBeNull();

    const signed = signSessionToken({ ...session, lastActiveAt: now - 90 * 60 * 1000 });
    expect(verifySessionToken(signed)).not.toBeNull();
  });

  it('exposes expanded non-clothing subcategories for thrifted-treasure', async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    await categoryController.listCategories({} as never, { status, json } as never, vi.fn());

    const payload = json.mock.calls[0]?.[0] as { data: Array<{ slug: string; subcategories: string[] }> };
    const treasure = payload.data.find((c) => c.slug === 'thrifted-treasure');
    expect(treasure?.subcategories).toEqual(
      expect.arrayContaining(['Books', 'Toys', 'Electronics & Radio', 'Collectibles', 'Home & Living', 'Other']),
    );
  });
});
