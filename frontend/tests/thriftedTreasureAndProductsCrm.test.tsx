import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { productService } from '../src/services/productService';
import { ProductDetailPage } from '../src/features/public/ProductDetailPage';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  getProducts: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../src/admin/services/adminApi', () => ({
  adminApi: {
    getProducts: mocks.getProducts,
  },
}));

vi.mock('../src/admin/context/AdminAuthContext', () => ({
  useAdminAuth: () => ({
    hasPermission: () => true,
  }),
}));

vi.mock('../src/admin/context/AdminToastContext', () => ({
  useAdminToast: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('../src/context/StoreContext', () => ({
  useStore: () => ({
    isWishlisted: () => false,
    toggleWishlist: vi.fn(),
    addToCart: vi.fn(),
  }),
}));

import type { Product as StorefrontProduct } from '../src/types/storefront';
import { ProductCard } from '../src/components/storefront/ProductCard';
import { ProductsPage } from '../src/admin/pages/ProductsPage';

const sampleProduct = (overrides: Partial<StorefrontProduct> = {}): StorefrontProduct => ({
  id: 'prod-1',
  serialNumber: 'TT-001',
  name: 'Vintage Brass Radio',
  slug: 'vintage-brass-radio',
  description: 'Working vintage radio',
  price: 180000,
  stock: 1,
  images: ['https://example.com/radio.jpg'],
  sizes: ['One Size'],
  variants: [],
  category: 'thrifted-treasure',
  categoryLabel: 'Thrifted Treasure',
  subcategory: 'Electronics & Radio',
  productType: 'Pre-Loved',
  condition: 'Mint',
  gender: 'Unisex',
  featured: false,
  isNewArrival: false,
  availability: 'In Stock',
  status: 'AVAILABLE',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('Thrifted Treasure image presentation & CRM ProductsPage regression', () => {
  beforeEach(() => {
    mocks.getProducts.mockReset();
    mocks.showToast.mockReset();
  });

  it('renders Thrifted Treasure ProductCard with square 1:1 viewport and object-cover without arch/nested wrapper', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ProductCard product={sampleProduct()} aspectClass="aspect-square" imageShape="rect" />
      </MemoryRouter>,
    );
    expect(html).toContain('product-image-frame--rect');
    expect(html).toContain('aspect-square');
    expect(html).toContain('object-cover');
    expect(html).toContain('object-center');
    expect(html).not.toContain('blob-arch');
    expect(html).not.toContain('p-1.5');
  });

  it('renders Thrifted Treasure ProductDetailPage and related recommendation cards with 1:1 square object-cover viewports', async () => {
    const treasure = sampleProduct({
      id: 'tt-detail-1',
      slug: 'vintage-brass-radio',
      images: ['https://example.com/radio-1.jpg', 'https://example.com/radio-2.jpg'],
    });
    const relatedTreasure = sampleProduct({
      id: 'tt-detail-2',
      serialNumber: 'TT-002',
      name: 'Retro Film Camera',
      slug: 'retro-film-camera',
      images: ['https://example.com/camera.jpg'],
    });
    productService.setProducts([treasure, relatedTreasure]);

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/product/vintage-brass-radio']}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const mainImg = host.querySelector('img[alt="Vintage Brass Radio view 1"]') as HTMLImageElement | null;
    expect(mainImg).not.toBeNull();
    expect(mainImg?.className).toContain('aspect-square');
    expect(mainImg?.className).toContain('object-cover');
    expect(mainImg?.className).toContain('object-center');
    expect(mainImg?.className).toContain('rounded-2xl');
    expect(mainImg?.className).not.toContain('object-contain');

    const viewport = mainImg?.parentElement;
    expect(viewport?.className).toContain('aspect-square');
    expect(viewport?.className).toContain('rounded-2xl');
    expect(viewport?.className).not.toContain('p-2');
    expect(viewport?.className).not.toContain('p-3');

    const thumbImg = host.querySelector('button[aria-label="View image 2"] img') as HTMLImageElement | null;
    expect(thumbImg?.className).toContain('aspect-square');
    expect(thumbImg?.className).toContain('object-cover');
    expect(thumbImg?.parentElement?.className).toContain('aspect-square');
    expect(thumbImg?.parentElement?.className).not.toContain('p-1');

    const zoomBtn = host.querySelector('button[aria-label="Zoom in on product"]') as HTMLButtonElement | null;
    expect(zoomBtn).not.toBeNull();
    await act(async () => {
      zoomBtn?.click();
    });
    expect(mainImg?.className).toContain('scale-125');

    const relatedImg = host.querySelector('img[alt="Retro Film Camera"]') as HTMLImageElement | null;
    expect(relatedImg).not.toBeNull();
    expect(relatedImg?.className).toContain('aspect-square');
    expect(relatedImg?.className).toContain('object-cover');
    expect(relatedImg?.parentElement?.className).toContain('product-image-frame--rect');
    expect(relatedImg?.parentElement?.className).not.toContain('shape-arch');

    root.unmount();
  });

  it('uses clean square frames on ThriftedTreasurePage and preserves non-treasure ProductDetailPage', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const treasureSrc = fs.readFileSync(path.join(srcDir, 'features/public/ThriftedTreasurePage.tsx'), 'utf8');
    const detailSrc = fs.readFileSync(path.join(srcDir, 'features/public/ProductDetailPage.tsx'), 'utf8');

    expect(treasureSrc).toContain('aspectClass="aspect-square"');
    expect(treasureSrc).toContain('imageShape="rect"');
    expect(detailSrc).toContain("product.category === 'thrifted-treasure'");
    expect(detailSrc).not.toContain('shape-arch');
    expect(detailSrc).not.toContain('wavy-oval');
  });

  it('loads all paginated product pages in CRM ProductsPage so older existing items are not missing', async () => {
    mocks.getProducts
      .mockResolvedValueOnce({
        data: [sampleProduct({ id: 'p1', serialNumber: 'TT-001', name: 'Page 1 Item' })],
        meta: { total: 2, page: 1, limit: 100, totalPages: 2, hasNext: true },
      })
      .mockResolvedValueOnce({
        data: [sampleProduct({ id: 'p2', serialNumber: 'TT-002', name: 'Page 2 Older Item' })],
        meta: { total: 2, page: 2, limit: 100, totalPages: 2, hasNext: false },
      });

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>,
      );
    });

    expect(mocks.getProducts).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Page 1 Item');
    expect(host.textContent).toContain('Page 2 Older Item');
    expect(host.textContent).not.toContain('No thrift products match your filter.');
    root.unmount();
  });

  it('shows error state instead of false filter mismatch when CRM product loading fails', async () => {
    mocks.getProducts.mockRejectedValueOnce(new Error('Network error loading catalog'));

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>,
      );
    });

    expect(host.textContent).toContain('Unable to load thrift products.');
    expect(host.textContent).toContain('Retry Loading Catalog');
    expect(host.textContent).not.toContain('No thrift products match your filter.');
    root.unmount();
  });
});
