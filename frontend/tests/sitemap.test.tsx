import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { SitemapPage } from '../src/features/public/SitemapPage';
import { productService } from '../src/services/productService';

const MOCK_PRODUCTS = [
  {
    id: 'prod-1',
    serialNumber: 'SN-001',
    name: 'Top and Skirt Co-Ord Set',
    slug: 'top-and-skirt-co-ord-set',
    category: 'womens-one-piece',
    categoryLabel: "Women's One-Piece",
    subcategory: 'Co-Ord Sets',
    productType: 'Pre-Loved',
    condition: 'Verified Vintage',
    gender: 'Women',
    price: 3500,
    images: ['/mock-coord.jpg'],
    sizes: ['S', 'M'],
    stock: 1,
    featured: true,
    isNewArrival: true,
    availability: 'In Stock' as const,
    description: 'Vintage co-ord set.',
    tags: ['vintage', 'coord'],
    variants: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'prod-2',
    serialNumber: 'SN-002',
    name: 'Vintage Leather Handbag',
    slug: 'vintage-leather-handbag',
    category: 'accessories',
    categoryLabel: 'Accessories',
    subcategory: 'Handbags',
    productType: 'Pre-Loved',
    condition: 'Mint Condition',
    gender: 'Unisex',
    price: 2400,
    images: ['/mock-bag.jpg'],
    sizes: ['One Size'],
    stock: 1,
    featured: false,
    isNewArrival: false,
    availability: 'In Stock' as const,
    description: 'Leather handheld satchel.',
    tags: ['leather', 'bag'],
    variants: [],
    createdAt: new Date().toISOString(),
  },
];

describe('SitemapPage UI and Architecture Directory', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    productService.setProducts(MOCK_PRODUCTS);
    container = document.createElement('div');
    document.body.appendChild(container);
    return () => {
      container.remove();
    };
  });

  it('renders sitemap header, structural sections, and XML sitemap link', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SitemapPage />
        </MemoryRouter>,
      );
    });

    // Header checks
    expect(container.textContent).toContain('Sitemap');
    expect(container.textContent).toContain('Site Architecture & Index');

    // XML Sitemap button
    const xmlLink = container.querySelector('a[href="/sitemap.xml"]');
    expect(xmlLink).not.toBeNull();
    expect(xmlLink?.textContent).toContain('XML Sitemap');

    // Key architectural sections
    expect(container.textContent).toContain('Curated Collections');
    expect(container.textContent).toContain('Apparel Catalog');
    expect(container.textContent).toContain('Accessories & Accents');
    expect(container.textContent).toContain('Community & Services');
    expect(container.textContent).toContain('Customer Experience');
    expect(container.textContent).toContain('Brand & Studio');

    // Core collection links
    expect(container.textContent).toContain('Brand New');
    expect(container.textContent).toContain('Thrifted Rail');
    expect(container.textContent).toContain('New Arrivals');
    expect(container.textContent).toContain('The Social Circle Events');

    // Clean up
    await act(async () => {
      root.unmount();
    });
  });

  it('renders the catalog directory and filters pieces by keyword', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <SitemapPage />
        </MemoryRouter>,
      );
    });

    const allProducts = productService.getAllProducts();
    expect(container.textContent).toContain('Catalog Directory');
    expect(container.textContent).toContain(`${allProducts.length} verified pieces`);

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Type a specific query
    await act(async () => {
      searchInput.value = 'Co-Ord';
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Co-Ord');

    await act(async () => {
      root.unmount();
    });
  });
});
