import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThriftedTreasurePage } from '../src/features/public/ThriftedTreasurePage';
import type { Product } from '../src/types/storefront';

const { mockProducts } = vi.hoisted(() => ({
  mockProducts: [
    {
      id: 'tt-book-1',
      serialNumber: 'CU-EX-001',
      name: 'First Edition Botanical Atlas',
      slug: 'first-edition-botanical-atlas',
      description: 'Vintage hardcover book.',
      price: 95000,
      stock: 1,
      category: 'thrifted-treasure',
      categoryLabel: 'Thrifted Treasure',
      subcategory: 'Books',
      productType: 'Pre-Loved',
      condition: 'Vintage Wear',
      gender: 'Unisex',
      sizes: ['One Size'],
      variants: [{ id: 'v-b', label: 'One Size', size: 'One Size', stock: 1 }],
      images: ['https://cdn.example.com/book.webp'],
      tags: ['thrift', 'books'],
      featured: false,
      isNewArrival: false,
      availability: 'In Stock',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'tt-radio-1',
      serialNumber: 'CU-EX-002',
      name: 'Retro Transistor Radio',
      slug: 'retro-transistor-radio',
      description: 'Working vintage radio.',
      price: 220000,
      stock: 8,
      category: 'thrifted-treasure',
      categoryLabel: 'Thrifted Treasure',
      subcategory: 'Electronics & Radio',
      productType: 'Pre-Loved',
      condition: 'Vintage Wear',
      gender: 'Unisex',
      sizes: ['One Size'],
      variants: [{ id: 'v-r', label: 'One Size', size: 'One Size', stock: 8 }],
      images: ['https://cdn.example.com/radio.webp'],
      tags: ['thrift', 'radio'],
      featured: false,
      isNewArrival: false,
      availability: 'In Stock',
      status: 'ACTIVE',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'clothing-tagged-treasure',
      serialNumber: 'CU-MS-009',
      name: 'Acid Wash Metallica Full Sleeve Shirt',
      slug: 'acid-wash-metallica-shirt',
      description: 'Graphic cotton shirt.',
      price: 120000,
      stock: 1,
      category: 'mens-upperwear',
      categoryLabel: "Men's Upperwear",
      subcategory: 'Shirts',
      productType: 'Pre-Loved',
      condition: 'Vintage Wear',
      gender: 'Men',
      sizes: ['L'],
      variants: [{ id: 'v-l', label: 'L', size: 'L', stock: 1 }],
      images: ['https://cdn.example.com/shirt.webp'],
      tags: ['one-of-a-kind', 'treasure'],
      featured: false,
      isNewArrival: false,
      availability: 'In Stock',
      status: 'ACTIVE',
      createdAt: '2026-01-03T00:00:00.000Z',
    },
    {
      id: 'misclassified-clothing-code',
      serialNumber: 'CU-MS-010',
      categoryCode: 'MS',
      name: 'Kanye West Graphic Tee',
      slug: 'kanye-west-tee',
      description: 'Vintage graphic tee.',
      price: 140000,
      stock: 1,
      category: 'thrifted-treasure',
      categoryLabel: 'Thrifted Treasure',
      subcategory: 'Shirts',
      productType: 'Pre-Loved',
      condition: 'Vintage Wear',
      gender: 'Men',
      sizes: ['M'],
      variants: [{ id: 'v-m', label: 'M', size: 'M', stock: 1 }],
      images: ['https://cdn.example.com/tee.webp'],
      tags: ['thrift'],
      featured: false,
      isNewArrival: false,
      availability: 'In Stock',
      status: 'ACTIVE',
      createdAt: '2026-01-04T00:00:00.000Z',
    },
  ] as Product[],
}));

vi.mock('../src/context/StoreContext', () => ({
  useStore: () => ({
    isWishlisted: () => false,
    toggleWishlist: vi.fn(),
  }),
}));

vi.mock('../src/services/productService', async () => {
  const actual = await vi.importActual<typeof import('../src/services/productService')>('../src/services/productService');
  return {
    ...actual,
    useCatalogVersion: () => 1,
    productService: {
      ...actual.productService,
      getAllProducts: () => mockProducts,
      queryProducts: ({ category }: { category?: string }) =>
        category ? mockProducts.filter((p) => p.category === category) : mockProducts,
    },
  };
});

describe('Client Enhancements: Thrifted Treasure Subcategory Browsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('renders Books, Toys, Electronics & Radio, Collectibles, Home & Living filters and filters items accurately', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/thrifted-treasure']}>
          <ThriftedTreasurePage />
        </MemoryRouter>,
      );
    });

    expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    scrollSpy.mockRestore();

    expect(container.textContent).toContain('First Edition Botanical Atlas');
    expect(container.textContent).toContain('Retro Transistor Radio');
    expect(container.textContent).not.toContain('Acid Wash Metallica Full Sleeve Shirt');
    expect(container.textContent).not.toContain('Kanye West Graphic Tee');
    expect(container.innerHTML).not.toContain('shape-arch');
    expect(container.querySelector('.product-image-frame--rect')).not.toBeNull();
    const cardImg = container.querySelector('.product-image-frame--rect img');
    expect(cardImg?.className).toContain('object-cover');
    expect(cardImg?.className).toContain('rounded-xl');
    expect(container.textContent).toContain('Books');
    expect(container.textContent).toContain('Toys');
    expect(container.textContent).toContain('Electronics & Radio');
    expect(container.textContent).toContain('Collectibles');
    expect(container.textContent).toContain('Home & Living');

    const booksButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Books',
    );
    expect(booksButton).toBeDefined();

    act(() => {
      booksButton?.click();
    });

    expect(container.textContent).toContain('First Edition Botanical Atlas');
    expect(container.textContent).not.toContain('Retro Transistor Radio');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
