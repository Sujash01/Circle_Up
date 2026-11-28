import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductDetailPage } from '../src/features/public/ProductDetailPage';
import type { Product } from '../src/types/storefront';

const { mockProduct } = vi.hoisted(() => ({
  mockProduct: {
    id: 'prod-red-gown',
    serialNumber: 'CU-WO-001',
    name: 'Crimson Evening Gown',
    slug: 'crimson-evening-gown',
    description: 'Floor-length evening gown.',
    price: 255000,
    stock: 1,
    category: 'womens-one-piece',
    categoryLabel: 'Women One-Piece',
    subcategory: 'Gowns',
    productType: 'Pre-Loved',
    condition: 'Mint',
    gender: 'Women',
    sizes: ['S'],
    variants: [{ id: 'v-s', label: 'S', size: 'S', stock: 1 }],
    images: [
      'https://cdn.example.com/gown-portrait.webp',
      'https://cdn.example.com/gown-square.webp',
      'https://cdn.example.com/gown-landscape.webp',
    ],
    tags: ['gown'],
    featured: false,
    isNewArrival: false,
    availability: 'Low Stock',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as Product,
}));

vi.mock('../src/context/StoreContext', () => ({
  useStore: () => ({
    isWishlisted: () => false,
    toggleWishlist: vi.fn(),
    addToCart: vi.fn(() => ({ ok: true })),
    cartCount: 0,
  }),
}));

vi.mock('../src/services/storefrontSettingsService', () => ({
  useStorefrontSettings: () => ({
    businessWhatsappNumber: '919999999999',
  }),
}));

vi.mock('../src/services/storefrontApi', () => ({
  storefrontApi: {
    getProductBySlug: vi.fn().mockResolvedValue(mockProduct),
  },
}));

vi.mock('../src/services/productService', () => ({
  useCatalogVersion: () => 1,
  mapRawProductToStorefront: (p: Product) => p,
  productService: {
    getProductBySlug: () => mockProduct,
    queryProducts: () => [],
    getRelatedProducts: () => [],
  },
}));

describe('ProductDetailPage Image Presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders a rectangular aspect-[4/5] object-contain frame without circular masking and switches thumbnails', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/product/crimson-evening-gown']}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    const mainImg = container.querySelector('img[alt="Crimson Evening Gown view 1"]') as HTMLImageElement | null;
    expect(mainImg).not.toBeNull();
    expect(mainImg?.className).toContain('object-contain');
    expect(mainImg?.className).toContain('rounded-xl');
    expect(mainImg?.parentElement?.className).toContain('aspect-[4/5]');
    expect(mainImg?.parentElement?.className).toContain('rounded-2xl');
    expect(container.innerHTML).not.toContain('wavy-oval');
    expect(container.innerHTML).not.toContain('shape-arch');

    const thumb2 = container.querySelector('button[aria-label="View image 2"]') as HTMLButtonElement | null;
    expect(thumb2).not.toBeNull();
    expect(thumb2?.querySelector('img')?.className).toContain('object-contain');

    await act(async () => {
      thumb2?.click();
    });

    const switchedImg = container.querySelector('img[alt="Crimson Evening Gown view 2"]') as HTMLImageElement | null;
    expect(switchedImg).not.toBeNull();
    expect(switchedImg?.getAttribute('src')).toBe('https://cdn.example.com/gown-square.webp');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not crash with React Error #31 when product.measurements is an object ({} or key/value map)', async () => {
    const objectMeasProduct: Product = {
      ...mockProduct,
      measurements: {} as unknown as string,
      measurementsData: { Bust: '34"', Waist: '28"' },
    };

    const { productService } = await import('../src/services/productService');
    const spy = vi.spyOn(productService, 'getProductBySlug').mockReturnValue(objectMeasProduct);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/product/crimson-evening-gown']}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Bust: 34" · Waist: 28"');

    spy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows a friendly retryable error state when product fetch fails instead of falsely showing not found', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { productService } = await import('../src/services/productService');
    const { storefrontApi } = await import('../src/services/storefrontApi');
    const spy = vi.spyOn(productService, 'getProductBySlug').mockReturnValue(undefined);
    vi.mocked(storefrontApi.getProductBySlug).mockRejectedValueOnce(new Error('Network error 500'));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/product/crimson-evening-gown']}>
          <Routes>
            <Route path="/product/:slug" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("We couldn't load this piece right now. Please try again.");
    expect(container.textContent).toContain('Try Again');
    expect(container.textContent).toContain('Go Home');
    expect(container.textContent).not.toContain('Network error 500');
    expect(consoleSpy).toHaveBeenCalled();

    spy.mockRestore();
    consoleSpy.mockRestore();
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
