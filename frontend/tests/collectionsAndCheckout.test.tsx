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
import { SearchPage } from '../src/features/public/SearchPage';
import { WishlistPage } from '../src/features/public/WishlistPage';
import { StorefrontHeader, StorefrontTopBanner } from '../src/components/storefront/StorefrontChrome';
import { ExitIntentModal } from '../src/components/storefront/ExitIntentModal';
import { productService } from '../src/services/productService';
import { cartService, type CartState } from '../src/services/cartService';
import { orderService } from '../src/services/orderService';
import { storefrontApi } from '../src/services/storefrontApi';
import { wishlistService } from '../src/services/wishlistService';
import * as storefrontSettings from '../src/services/storefrontSettingsService';
import type { StorefrontSettings } from '@circleup/shared';
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
    price: 320000,
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
    price: 450000,
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

const publicSettings: StorefrontSettings = {
  header: { text: 'Configured announcement', link: '/new-arrivals', isActive: true },
  automaticCodes: [],
  exitOffer: null,
  whatsappNumber: '916280746336',
};

describe('Brand New & Thrifted Collections and Checkout Hardening', () => {
  const dialog = HTMLDialogElement.prototype;
  const originalDialogMethods = new Map(['showModal', 'close'].map((key) => [
    key, Object.getOwnPropertyDescriptor(dialog, key),
  ]));

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, descriptor] of originalDialogMethods) {
      if (descriptor) Object.defineProperty(dialog, key, descriptor);
      else Reflect.deleteProperty(dialog, key);
    }
    wishlistService.saveIds([]);
  });

  beforeEach(() => {
    vi.spyOn(storefrontSettings, 'useStorefrontSettings').mockReturnValue(publicSettings);
    productService.setProducts(TEST_PRODUCTS);
    cartService.clearCart();
    Object.defineProperties(dialog, {
      showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
      close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
    });
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

  it.each([
    { name: 'search deep link', path: '/search?q=leather', page: <SearchPage />, empty: 'No pieces matched' },
    { name: 'saved wishlist', path: '/wishlist', page: <WishlistPage />, empty: 'Your wishlist is empty' },
  ])('recalculates $name when the catalogue loads after first render', ({ path, page, empty }) => {
    productService.clearCatalog();
    wishlistService.saveIds(['test-thrifted-1']);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      act(() => root.render(<StoreProvider><MemoryRouter initialEntries={[path]}>{page}</MemoryRouter></StoreProvider>));
      expect(host.textContent).toContain(empty);
      act(() => productService.setProducts(TEST_PRODUCTS));
      expect(host.textContent).toContain('Vintage 90s Leather Jacket');
      expect(host.textContent).not.toContain(empty);
      expect(host.textContent).not.toContain('Artisan Embroidered Vest');
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });

  it.each([
    'Free Shipping on orders above ₹2,500',
    'Free delivery for orders of ₹1,500 or more',
  ])('corrects the shipping banner while preserving its announcement (%s)', (legacy) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      vi.mocked(storefrontSettings.useStorefrontSettings).mockReturnValue({
        ...publicSettings,
        header: { ...publicSettings.header, text: `Curated Vintage Drops Every Friday · ${legacy}` },
      });
      act(() => root.render(<StoreProvider><MemoryRouter><StorefrontTopBanner /></MemoryRouter></StoreProvider>));
      expect(host.textContent).toContain('Curated Vintage Drops Every Friday');
      expect(host.textContent).toContain('₹1,000 or more after discounts');
      expect(host.textContent).not.toContain('₹2,500');
      expect(host.textContent).not.toContain('₹1,500');
    } finally {
      act(() => root.unmount());
    }
  });

  it('uses the configured header and exit promotion copy and saves the claimed code', () => {
    vi.mocked(storefrontSettings.useStorefrontSettings).mockReturnValue({
      ...publicSettings,
      header: { ...publicSettings.header, text: 'This weekend only', code: 'PUBLIC10', ctaLabel: 'Copy PUBLIC10' },
      exitOffer: { code: 'PUBLIC10', headline: 'A weekend offer', subtext: 'Browse the sale', badgeText: '10% off', targetPages: ['home'], cooldownHours: 24 },
    });
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      act(() => root.render(<StoreProvider><MemoryRouter><StorefrontTopBanner /><ExitIntentModal /></MemoryRouter></StoreProvider>));
      expect(host.textContent).toContain('This weekend only');
      expect(host.textContent).toContain('Copy PUBLIC10');
      act(() => document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0 })));
      const modal = document.querySelector('[aria-labelledby="exit-offer-title"]');
      expect(modal?.textContent).toContain('A weekend offer');
      expect(modal?.textContent).toContain('Browse the sale');
      act(() => modal?.querySelector<HTMLButtonElement>('.exit-offer-claim')?.click());
      expect(cartService.loadCart().promoCode).toBe('PUBLIC10');
      expect(document.querySelector('[aria-labelledby="exit-offer-title"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      localStorage.removeItem('circleup_exit_offer_PUBLIC10');
    }
  });

  function saveCartWithTestItem(unitPrice = 320000, promoCode?: string) {
    const cartWithItem: CartState = {
      cartId: 'test-cart-123',
      items: [
        {
          key: 'test-brand-new-1::var-1',
          productId: 'test-brand-new-1',
          name: 'Artisan Embroidered Vest',
          slug: 'artisan-embroidered-vest',
          unitPrice,
          image: '/test-vest.jpg',
          size: 'M',
          variantLabel: 'Medium',
          quantity: 1,
          maxStock: 2,
        },
      ],
      promoCode,
    };
    cartService.saveCart(cartWithItem);
  }

  it.each([
    [99800, 9000],
    [99900, 9000],
    [99999, 9000],
    [100000, 0],
    [100001, 0],
  ])('estimates shipping on a %i paise bag', (unitPrice, deliveryFee) => {
    saveCartWithTestItem(unitPrice);
    expect(cartService.calculateTotals(cartService.loadCart()))
      .toMatchObject({ deliveryFee, estimatedTotal: unitPrice + deliveryFee });
  });

  it('gives an empty bag free shipping and a fully discounted nonempty bag the flat rate', () => {
    expect(cartService.calculateTotals({ cartId: 'empty', items: [] }))
      .toMatchObject({ deliveryFee: 0, estimatedTotal: 0 });
    saveCartWithTestItem(100000, 'ALL');
    expect(cartService.calculateTotals(cartService.loadCart(), 100000))
      .toMatchObject({ deliveryFee: 9000, estimatedTotal: 9000 });
  });

  it('quotes shipping after the server-validated discount in the bag and WhatsApp estimate', async () => {
    vi.spyOn(orderService, 'getRazorpayAvailability').mockResolvedValue({ available: false });
    const validateCoupon = vi.spyOn(storefrontApi, 'validateCoupon').mockResolvedValue({
      code: 'DROP', valid: true, discountInPaise: 101, message: 'Promo code DROP applied successfully!',
    });
    saveCartWithTestItem(100100, 'DROP');
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <Provider store={store}><StoreProvider><MemoryRouter><CartPage /></MemoryRouter></StoreProvider></Provider>,
      ));
      expect(validateCoupon).toHaveBeenCalledWith('DROP', 100100, expect.any(AbortSignal));
      expect(host.textContent).toContain('₹90');
      expect(host.textContent).toContain('₹1,089.99');
      const enquiry = host.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
      const destination = enquiry && new URL(enquiry.href);
      expect(destination && `${destination.origin}${destination.pathname}`).toBe('https://wa.me/916280746336');
      const message = destination?.searchParams.get('text');
      expect(message).toContain('Discount (DROP): -₹1.01');
      expect(message).toContain('• Artisan Embroidered Vest (Ref: BN-001 | M) × 1 — ₹1,001');
      expect(message).toContain('Shipping: ₹90');
      expect(message).toContain('Total: ₹1,089.99');
    } finally {
      act(() => root.unmount());
    }
  });

  it('validates automatic offers in priority order and uses one quote for the bag and WhatsApp without placing an order', async () => {
    vi.mocked(storefrontSettings.useStorefrontSettings).mockReturnValue({
      ...publicSettings, automaticCodes: ['MINIMUM', 'AUTO10'],
    });
    vi.spyOn(orderService, 'getRazorpayAvailability').mockResolvedValue({ available: false });
    const createOrder = vi.spyOn(orderService, 'createOrder');
    const validate = vi.spyOn(storefrontApi, 'validateCoupon')
      .mockResolvedValueOnce({ code: 'MINIMUM', valid: false, discountInPaise: 0, message: 'Minimum order needed' })
      .mockResolvedValueOnce({ code: 'AUTO10', valid: true, discountInPaise: 101, message: 'Automatic discount applied' });
    saveCartWithTestItem(100100);
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <Provider store={store}><StoreProvider><MemoryRouter><CartPage /></MemoryRouter></StoreProvider></Provider>,
      ));
      expect(validate.mock.calls.map(([code]) => code)).toEqual(['MINIMUM', 'AUTO10']);
      expect(host.textContent).toContain('₹1,089.99');
      const link = host.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]');
      const message = link && new URL(link.href).searchParams.get('text');
      expect(message).toContain('Discount (AUTO10): -₹1.01');
      expect(message).toContain('Shipping: ₹90');
      expect(message).toContain('Total: ₹1,089.99');
      expect(createOrder).not.toHaveBeenCalled();
      expect(cartService.loadCart().promoCode).toBeUndefined();
    } finally {
      act(() => root.unmount());
    }
  });

  it('keeps the enquiry option visible without a link when the verified contact is unavailable', async () => {
    vi.mocked(storefrontSettings.useStorefrontSettings).mockReturnValue({ ...publicSettings, whatsappNumber: '' });
    vi.spyOn(orderService, 'getRazorpayAvailability').mockResolvedValue({ available: false });
    saveCartWithTestItem();
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <Provider store={store}><StoreProvider><MemoryRouter><CartPage /></MemoryRouter></StoreProvider></Provider>,
      ));
      const enquiry = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'WhatsApp Enquiry');
      expect(enquiry?.disabled).toBe(true);
      expect(host.querySelector('a[href^="https://wa.me/"]')).toBeNull();
      expect(host.textContent).toContain('WhatsApp enquiries are currently unavailable.');
    } finally {
      act(() => root.unmount());
    }
  });

  it('ignores a direct payment hash with an empty bag even when the gateway is available', async () => {
    vi.spyOn(orderService, 'getRazorpayAvailability').mockResolvedValue({ available: true });
    const currentUrl = window.location.href;
    window.history.replaceState(null, '', '#checkout-step2');
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <Provider store={store}><StoreProvider><MemoryRouter><CartPage /></MemoryRouter></StoreProvider></Provider>,
      ));
      expect(host.textContent).toContain('Your shopping bag is empty');
      expect(host.querySelector('dialog')).toBeNull();
    } finally {
      act(() => root.unmount());
      window.history.replaceState(null, '', currentUrl);
    }
  });

  it('keeps online checkout disabled when availability is pending, false, or unreachable', async () => {
    saveCartWithTestItem(80000);
    let reportAvailability!: (value: { available: boolean }) => void;
    const availability = vi.spyOn(orderService, 'getRazorpayAvailability')
      .mockImplementationOnce(() => new Promise((resolve) => { reportAvailability = resolve; }))
      .mockRejectedValueOnce(new Error('API unavailable'));
    const createOrder = vi.spyOn(orderService, 'createOrder').mockRejectedValue(new Error('Unexpected order request'));
    const originalLocation = window.location.href;
    window.history.replaceState(null, '', '#checkout-step2');
    const host = document.createElement('div');
    document.body.appendChild(host);

    const renderCart = (root: ReturnType<typeof createRoot>) => root.render(
      <Provider store={store}>
        <StoreProvider>
          <MemoryRouter>
            <CartPage />
          </MemoryRouter>
        </StoreProvider>
      </Provider>,
    );
    const checkoutButton = () => Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Razorpay Checkout'));

    let root = createRoot(host);
    try {
      act(() => renderCart(root));
      expect(checkoutButton()?.disabled).toBe(true);
      expect(host.textContent).toContain('Checking online payment availability');

      await act(async () => reportAvailability({ available: false }));
      expect(checkoutButton()?.disabled).toBe(true);
      act(() => checkoutButton()?.click());
      expect(host.textContent).toContain('Online payment is currently unavailable');
      const checkoutOptions = checkoutButton()?.parentElement;
      expect([...(checkoutOptions?.querySelectorAll('button[type="button"], a') ?? [])]
        .map((element) => element.textContent?.trim())
        .filter((label) => label !== 'Copy'))
        .toEqual(['Razorpay Checkout', 'WhatsApp Enquiry']);
      expect(checkoutOptions?.querySelector('a')?.href).toMatch(/^https:\/\/wa\.me\//);
      expect(host.textContent).not.toContain('Complete Your Order');

      act(() => root.unmount());
      root = createRoot(host);
      await act(async () => renderCart(root));
      expect(availability).toHaveBeenCalledTimes(2);
      expect(checkoutButton()?.disabled).toBe(true);
      expect(host.textContent).not.toContain('Pay with Razorpay');
      expect(createOrder).not.toHaveBeenCalled();
      expect(document.querySelector('script[src*="checkout.razorpay.com"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
      window.history.replaceState(null, '', originalLocation);
    }
  });

  it('allows Razorpay when available and makes no order if the checkout script fails', async () => {
    vi.spyOn(orderService, 'getRazorpayAvailability').mockResolvedValue({ available: true });
    const createOrder = vi.spyOn(orderService, 'createOrder').mockRejectedValue(new Error('Unexpected order request'));
    saveCartWithTestItem(80000);
    const currentUrl = window.location.href;
    window.history.replaceState(null, '', '#checkout-step2');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
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
    expect(host.textContent).toContain('₹90');
    expect(host.textContent).toContain('₹890');
    expect(host.querySelector('dialog')).toBeNull();

    // Click Proceed to Direct Checkout
    const checkoutBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Razorpay Checkout'),
    );
    expect(checkoutBtn).toBeDefined();
    expect(checkoutBtn?.disabled).toBe(false);

    act(() => {
      checkoutBtn?.click();
    });
    const modal = host.querySelector('dialog')!;
    const close = modal.querySelector<HTMLButtonElement>('[aria-label="Close checkout"]')!;
    const next = modal.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(modal.open).toBe(true);
    expect(modal.getAttribute('aria-labelledby')).toBe('checkout-title');
    expect(document.activeElement?.id).toBe('checkout-title');
    act(() => {
      close.focus();
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(next);
    act(() => next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(close);

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
      setInputValue(phoneInput, 'abcdefghi');
      setInputValue(addressInput, '12 Indiranagar 100ft Rd');
      setInputValue(cityInput, 'Bengaluru');
      setInputValue(stateInput, 'Karnataka');
      setInputValue(pinInput, '1a2b3c');
    });

    // Submit Step 1 checkout form (second form on the page) to advance to Step 2
    const checkoutForm = Array.from(host.querySelectorAll('form')).find((f) =>
      f.textContent?.includes('Delivery Street Address'),
    );
    expect(checkoutForm).toBeDefined();

    const submitDelivery = () => checkoutForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    act(() => { submitDelivery(); });
    expect(host.querySelector('[role=alert]')?.textContent).toContain('10-digit Indian mobile');
    act(() => { setInputValue(phoneInput, '+91 98765 43210'); });
    act(() => { submitDelivery(); });
    expect(host.querySelector('[role=alert]')?.textContent).toContain('six-digit Indian PIN');
    act(() => { setInputValue(pinInput, '560038'); });
    act(() => { submitDelivery(); });

    expect(host.textContent).toContain('Razorpay Online Payment');
    expect(host.textContent).toContain('Pay with Razorpay · ₹890');
    expect(host.textContent).toContain('Sole Payment Method');
    expect(host.textContent).not.toContain('Cash on Delivery (COD)');
    const codChoice = host.querySelector('input[name="paymentMethod"][value="CASH_ON_DELIVERY"]');
    expect(codChoice).toBeNull();

    const paymentForm = Array.from(host.querySelectorAll('form')).find((form) =>
      form.textContent?.includes('Pay with Razorpay'));
    expect(paymentForm).toBeDefined();
    act(() => paymentForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const checkoutScript = document.querySelector('script[src*="checkout.razorpay.com"]');
    expect(checkoutScript).not.toBeNull();
    await act(async () => checkoutScript?.dispatchEvent(new Event('error')));
    expect(host.textContent).toContain('The online payment window could not load');
    expect(host.textContent).toContain('Artisan Embroidered Vest');
    expect(createOrder).not.toHaveBeenCalled();

    act(() => modal.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(checkoutBtn);
    act(() => checkoutBtn?.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Close checkout"]')?.click());
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(checkoutBtn);
    act(() => {
      root.unmount();
    });
    host.remove();
    window.history.replaceState(null, '', currentUrl);
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
