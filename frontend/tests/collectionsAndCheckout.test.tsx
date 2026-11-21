import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../src/app/store';
import { StoreProvider } from '../src/context/StoreContext';
import { BrandNewPage } from '../src/features/public/BrandNewPage';
import { ThriftedPage } from '../src/features/public/ThriftedPage';
import { CartPage } from '../src/features/public/CartPage';
import { StorefrontHeader } from '../src/components/storefront/StorefrontChrome';
import { productService } from '../src/services/productService';
import { cartService, type CartState } from '../src/services/cartService';
import { storefrontApi, type HomepagePayload } from '../src/services/storefrontApi';
import type { Product } from '../src/types/storefront';

const TEST_PRODUCTS: Product[] = [
  {
    id: 'test-brand-new-1',
    serialNumber: 'BN-001',
    name: 'Artisan Embroidered Vest',
    slug: 'artisan-embroidered-vest',
    category: 'handcrafted',
    categoryLabel: 'Handcrafted',
    subcategory: 'Vests',
    productType: 'Handcrafted',
    condition: 'Artisan Made',
    gender: 'Unisex',
    price: 3200,
    images: ['/test-vest.jpg'],
    sizes: ['M', 'L'],
    stock: 2,
    featured: true,
    isNewArrival: true,
    availability: 'In Stock',
    description: 'Handcrafted artisan embroidered vest.',
    tags: ['handcrafted', 'artisan'],
    variants: [{ id: 'var-1', label: 'Medium', size: 'M', stock: 2 }],
    createdAt: '2026-11-15T10:00:00Z',
  },
  {
    id: 'test-thrifted-1',
    serialNumber: 'TH-001',
    name: 'Vintage 90s Leather Jacket',
    slug: 'vintage-90s-leather-jacket',
    category: 'womens-upperwear',
    categoryLabel: "Women's Upperwear",
    subcategory: 'Jackets',
    productType: 'Pre-Loved',
    condition: 'Vintage Wear',
    gender: 'Women',
    price: 4500,
    images: ['/test-leather.jpg'],
    sizes: ['S'],
    stock: 1,
    featured: false,
    isNewArrival: false,
    availability: 'In Stock',
    description: 'Classic 90s boxy cut motorcycle leather jacket.',
    tags: ['vintage', 'leather', 'thrift'],
    variants: [{ id: 'var-2', label: 'Small', size: 'S', stock: 1 }],
    createdAt: '2026-11-14T10:00:00Z',
  },
];

describe('Brand New & Thrifted Collections and Checkout Hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    productService.setProducts(TEST_PRODUCTS);
    cartService.clearCart();
  });

  it('filters Brand New vs Thrifted products accurately in productService', () => {
    const brandNew = productService.getBrandNewProducts();
    const thrifted = productService.getThriftedProducts();

    expect(brandNew.some((p) => p.id === 'test-brand-new-1')).toBe(true);
    expect(brandNew.some((p) => p.id === 'test-thrifted-1')).toBe(false);

    expect(thrifted.some((p) => p.id === 'test-thrifted-1')).toBe(true);
    expect(thrifted.some((p) => p.id === 'test-brand-new-1')).toBe(false);
  });

  it('renders BrandNewPage with editorial header and pieces', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <BrandNewPage />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('Brand New');
    expect(host.textContent).toContain('Pristine Rails & Studio Creations');
    expect(host.textContent).toContain('Artisan Embroidered Vest');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders ThriftedPage with editorial header and pieces', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <ThriftedPage />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('Curated Thrifted');
    expect(host.textContent).toContain('Pre-Loved, Archival & Thrifted Rails');
    expect(host.textContent).toContain('Vintage 90s Leather Jacket');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('offers COD, disables unconfigured WhatsApp payment, and keeps Razorpay unavailable', async () => {
    vi.spyOn(storefrontApi, 'getHomepage').mockResolvedValue({
      siteSettings: { whatsappNumber: '' },
    } as HomepagePayload);
    const cartWithItem: CartState = {
      cartId: 'test-cart-123',
      items: [
        {
          key: 'test-brand-new-1::var-1',
          productId: 'test-brand-new-1',
          name: 'Artisan Embroidered Vest',
          slug: 'artisan-embroidered-vest',
          unitPrice: 3200,
          image: '/test-vest.jpg',
          size: 'M',
          variantLabel: 'Medium',
          quantity: 1,
          maxStock: 2,
        },
      ],
      promoCode: undefined,
    };
    cartService.saveCart(cartWithItem);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <CartPage />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    // Verify cart page loaded
    expect(host.textContent).toContain('Artisan Embroidered Vest');

    // Click Proceed to Direct Checkout
    const checkoutBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Place Order / Direct Checkout'),
    );
    expect(checkoutBtn).toBeDefined();

    act(() => {
      checkoutBtn?.click();
    });

    // Fill in Step 1 fields
    const nameInput = host.querySelector('input[placeholder="e.g. Aanya Sharma"]') as HTMLInputElement;
    const emailInput = host.querySelector('input[type="email"]') as HTMLInputElement;
    const phoneInput = host.querySelector('input[type="tel"]') as HTMLInputElement;
    const addressInput = host.querySelector('input[placeholder="House/Flat No., Building, Street"]') as HTMLInputElement;
    const cityInput = host.querySelector('input[placeholder="Mumbai"]') as HTMLInputElement;
    const stateInput = host.querySelector('input[placeholder="Maharashtra"]') as HTMLInputElement;
    const pinInput = host.querySelector('input[placeholder="400050"]') as HTMLInputElement;

    expect(nameInput).not.toBeNull();
    expect(pinInput).not.toBeNull();

    const setInputValue = (input: HTMLInputElement, value: string) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    act(() => {
      setInputValue(nameInput, 'Rohan Sen');
      setInputValue(emailInput, 'rohan@example.com');
      setInputValue(phoneInput, '+919876543210');
      setInputValue(addressInput, '12 Indiranagar 100ft Rd');
      setInputValue(cityInput, 'Bengaluru');
      setInputValue(stateInput, 'Karnataka');
      setInputValue(pinInput, '560038');
    });

    // Submit Step 1 checkout form (second form on the page) to advance to Step 2
    const checkoutForm = Array.from(host.querySelectorAll('form')).find((f) =>
      f.textContent?.includes('Delivery Street Address'),
    );
    expect(checkoutForm).toBeDefined();

    await act(async () => {
      checkoutForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Cash on Delivery (COD)');
    expect(host.textContent).toContain('WhatsApp / UPI');
    expect(host.textContent).toContain('store payment contact is not configured');
    expect(host.textContent).toContain('Razorpay online payment — temporarily unavailable');
    const whatsappChoice = host.querySelector('input[name="paymentMethod"][value="WHATSAPP_UPI"]') as HTMLInputElement;
    const codChoice = host.querySelector('input[name="paymentMethod"][value="CASH_ON_DELIVERY"]') as HTMLInputElement;
    expect(whatsappChoice.disabled).toBe(true);
    expect(codChoice.checked).toBe(true);

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders Collections directory dropdown with exact column headings and item order', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter initialEntries={['/#collections']}>
              <StorefrontHeader />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    const dropdown = host.querySelector('[role="dialog"][aria-label="CircleUp Collections Directory"]');
    expect(dropdown).not.toBeNull();

    // Check headings
    const headings = Array.from(dropdown!.querySelectorAll('h2')).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Clothing', 'Other Items', 'CircleUp World']);

    // Check Other Items order
    const columns = dropdown!.querySelectorAll('.grid-cols-3 > div');
    expect(columns.length).toBe(3);

    const otherItemsLinks = Array.from(columns[1]!.querySelectorAll('li a')).map((a) =>
      a.textContent?.trim(),
    );
    expect(otherItemsLinks).toEqual([
      'Jewellery',
      'Accessories',
      'Footwear',
      'Handcrafted',
      'Rentals',
    ]);

    // Check CircleUp World items order
    const circleUpWorldLinks = Array.from(columns[2]!.querySelectorAll('li a')).map((a) =>
      a.textContent?.trim(),
    );
    expect(circleUpWorldLinks).toEqual([
      'About Us',
      'Events — Social Circle',
      '#ThriftCrew',
      'Reviews',
      'Contact',
    ]);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
