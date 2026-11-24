import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertRupeesToPaise, formatPrice } from '@circleup/shared';
import { store } from '../src/app/store';
import { StoreProvider } from '../src/context/StoreContext';
import { cartService, type CartState } from '../src/services/cartService';
import { productService } from '../src/services/productService';
import { wishlistService } from '../src/services/wishlistService';
import { ProductCard } from '../src/components/storefront/ProductCard';
import { ProductDetailPage } from '../src/features/public/ProductDetailPage';
import { CartPage } from '../src/features/public/CartPage';
import { WishlistPage } from '../src/features/public/WishlistPage';
import type { Product } from '../src/types/storefront';

const TEST_PRODUCT_550: Product = {
  id: 'test-product-550',
  serialNumber: 'CU-550',
  name: 'Vintage Uniqlo Zipper Hoodie',
  slug: 'vintage-uniqlo-zipper-hoodie',
  category: 'womens-upperwear',
  categoryLabel: "Women's Upperwear",
  subcategory: 'Hoodies',
  productType: 'Pre-Loved',
  condition: 'Mint',
  gender: 'Women',
  price: 55000, // 55000 paise = ₹550
  originalPrice: 120000,
  images: ['/test-hoodie.jpg'],
  sizes: ['M'],
  stock: 1,
  featured: true,
  isNewArrival: true,
  availability: 'In Stock',
  description: 'Classic dark blue zipper hoodie in pure fleece cotton.',
  tags: ['hoodie', 'vintage'],
  variants: [{ id: 'var-hoodie-m', label: 'Size M', size: 'M', stock: 1 }],
  createdAt: '2026-11-20T10:00:00Z',
};

describe('P0-1 Monetary Specification & Integer Paise Formatting', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    localStorage.clear();
  });

  afterEach(() => {
    if (host.parentNode) {
      host.parentNode.removeChild(host);
    }
    vi.restoreAllMocks();
  });

  it('formats integer paise correctly into Indian Currency (₹) strings', () => {
    // 55000 paise = ₹550
    expect(formatPrice(55000)).toBe('₹550');
    // 35000 paise = ₹350
    expect(formatPrice(35000)).toBe('₹350');
    // 150000 paise = ₹1,500
    expect(formatPrice(150000)).toBe('₹1,500');
    // 9000 paise = ₹90
    expect(formatPrice(9000)).toBe('₹90');
    // 255000 paise = ₹2,550
    expect(formatPrice(255000)).toBe('₹2,550');
    // 400000 paise = ₹4,000
    expect(formatPrice(400000)).toBe('₹4,000');
    // 0 paise = ₹0
    expect(formatPrice(0)).toBe('₹0');
    // Negative or NaN fallback = ₹0
    expect(formatPrice(-500)).toBe('₹0');
    // Fractional paise format: 255050 paise = ₹2,550.50
    expect(formatPrice(255050)).toBe('₹2,550.50');
    // Large number with Indian numbering grouping: 12345678 paise = ₹1,23,456.78
    expect(formatPrice(12345678)).toBe('₹1,23,456.78');
  });

  it('converts rupee values (550, 350) from CSV import cleanly to integer paise', () => {
    expect(convertRupeesToPaise(550)).toBe(55000);
    expect(convertRupeesToPaise('550')).toBe(55000);
    expect(convertRupeesToPaise(350)).toBe(35000);
    expect(convertRupeesToPaise('350')).toBe(35000);
    expect(convertRupeesToPaise(1500)).toBe(150000);
    expect(convertRupeesToPaise('90')).toBe(9000);
    expect(convertRupeesToPaise(2550.5)).toBe(255050);
  });

  it('proves 55000 paise renders as ₹550 on ProductCard', () => {
    const root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <ProductCard product={TEST_PRODUCT_550} />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('₹550');
    expect(host.textContent).not.toContain('₹55,000');
    expect(host.textContent).not.toContain('₹550.00');

    act(() => {
      root.unmount();
    });
  });

  it('proves 55000 paise renders as ₹550 on ProductDetailPage (PDP)', () => {
    vi.spyOn(productService, 'getProductBySlug').mockReturnValue(TEST_PRODUCT_550);

    const root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter initialEntries={['/product/vintage-uniqlo-zipper-hoodie']}>
              <Routes>
                <Route path="/product/:slug" element={<ProductDetailPage />} />
              </Routes>
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('₹550');
    expect(host.textContent).toContain('Vintage Uniqlo Zipper Hoodie');
    expect(host.textContent).not.toContain('₹55,000');

    act(() => {
      root.unmount();
    });
  });

  it('proves 55000 paise renders as ₹550 on CartPage with correct delivery fee math', () => {
    const cartState: CartState = {
      cartId: 'CU-CART-TEST-550',
      items: [
        {
          key: 'test-product-550::var-hoodie-m',
          productId: 'test-product-550',
          name: 'Vintage Uniqlo Zipper Hoodie',
          slug: 'vintage-uniqlo-zipper-hoodie',
          image: '/test-hoodie.jpg',
          size: 'M',
          variantLabel: 'Size M',
          unitPrice: 55000, // 55000 paise = ₹550
          quantity: 1,
          maxStock: 1,
        },
      ],
    };
    cartService.saveCart(cartState);

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

    // Subtotal and unit price should show ₹550
    expect(host.textContent).toContain('₹550');
    expect(host.textContent).toContain('₹90');
    expect(host.textContent).toContain('₹1,000');
    expect(host.textContent).toContain('₹640');

    act(() => {
      root.unmount();
    });
  });

  it('proves 55000 paise renders as ₹550 on WishlistPage', () => {
    vi.spyOn(wishlistService, 'loadIds').mockReturnValue(['test-product-550']);
    vi.spyOn(productService, 'getProductById').mockReturnValue(TEST_PRODUCT_550);

    const root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <WishlistPage />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('Vintage Uniqlo Zipper Hoodie');
    expect(host.textContent).toContain('₹550');
    expect(host.textContent).not.toContain('₹55,000');

    act(() => {
      root.unmount();
    });
  });

  it('proves 55000 paise formats as ₹550 in WhatsApp checkout and enquiry messages', () => {
    const cartState: CartState = {
      cartId: 'CU-CART-20261120-WA55',
      items: [
        {
          key: 'test-product-550::var-hoodie-m',
          productId: 'test-product-550',
          name: 'Vintage Uniqlo Zipper Hoodie',
          slug: 'vintage-uniqlo-zipper-hoodie',
          image: '/test-hoodie.jpg',
          size: 'M',
          variantLabel: 'Size M',
          unitPrice: 55000,
          quantity: 1,
          maxStock: 1,
        },
      ],
    };

    const waCheckout = cartService.buildWhatsAppCheckout(cartState, 'Please deliver soon');
    expect(waCheckout.totals.subtotal).toBe(55000);
    expect(waCheckout.totals.estimatedTotal).toBe(64000);
    expect(waCheckout.message).toMatch(/1\. Vintage Uniqlo Zipper Hoodie \(Ref: .+, Size: M\) x1 — ₹550/);
    expect(waCheckout.message).toContain('Subtotal: ₹550');
    expect(waCheckout.message).toContain('Estimated Shipping: ₹90');
    expect(waCheckout.message).toContain('Estimated Total: ₹640');
    expect(waCheckout.message).not.toContain('₹55,000');

    const waProduct = cartService.buildProductWhatsAppUrl(TEST_PRODUCT_550, 'Size M', '919111222333');
    const decodedUrl = decodeURIComponent(waProduct ?? '');
    expect(decodedUrl).toContain('• Price: ₹550');
    expect(decodedUrl).not.toContain('₹55,000');
  });

  it('proves "Latex bodysuit" (serial 160, price 700 (Rental)) renders as ₹700 (never ₹7) across PDP, ProductCard, and WhatsApp text', () => {
    const TEST_LATEX_BODYSUIT: Product = {
      id: 'test-latex-160',
      serialNumber: '160',
      name: 'Latex bodysuit',
      slug: 'latex-bodysuit-160',
      category: 'womens-one-piece',
      categoryLabel: "Women's One Piece",
      subcategory: 'Bodysuits',
      productType: 'Rental',
      condition: 'Mint',
      gender: 'Women',
      price: 70000, // 70000 paise = ₹700 (converted from "700 (Rental)")
      originalPrice: 150000,
      images: ['/latex-bodysuit.jpg'],
      sizes: ['XS-S'],
      stock: 1,
      featured: true,
      isNewArrival: true,
      availability: 'In Stock',
      description: "XS-S (bust-34', waist-28', shoulder-14', sleeve-21', length-55')",
      tags: ['latex', 'bodysuit', 'rental'],
      variants: [{ id: 'var-latex-1', label: 'XS-S', size: 'XS-S', stock: 1 }],
      createdAt: '2026-11-20T10:00:00Z',
    };

    // 1. Test ProductCard rendering
    const root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter>
              <ProductCard product={TEST_LATEX_BODYSUIT} />
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(host.textContent).toContain('Latex bodysuit');
    expect(host.textContent).toContain('₹700');
    expect(host.textContent).not.toContain('₹7 ');
    expect(host.textContent).not.toContain('₹7.00');

    act(() => {
      root.unmount();
    });

    // 2. Test ProductDetailPage rendering with normalized price
    productService.setProducts([TEST_LATEX_BODYSUIT]);
    const pdpHost = document.createElement('div');
    document.body.appendChild(pdpHost);
    const pdpRoot = createRoot(pdpHost);

    act(() => {
      pdpRoot.render(
        <Provider store={store}>
          <StoreProvider>
            <MemoryRouter initialEntries={['/product/latex-bodysuit-160']}>
              <Routes>
                <Route path="/product/:slug" element={<ProductDetailPage />} />
              </Routes>
            </MemoryRouter>
          </StoreProvider>
        </Provider>,
      );
    });

    expect(pdpHost.textContent).toContain('Latex bodysuit');
    expect(pdpHost.textContent).toContain('₹700');
    expect(pdpHost.textContent).not.toContain('₹7\n');
    expect(pdpHost.textContent).not.toContain('₹7 ');

    act(() => {
      pdpRoot.unmount();
    });
    pdpHost.remove();

    // 3. Test WhatsApp Enquiry message
    const waProduct = cartService.buildProductWhatsAppUrl(TEST_LATEX_BODYSUIT, 'XS-S', '919111222333');
    const decodedUrl = decodeURIComponent(waProduct ?? '');
    expect(decodedUrl).toContain('Latex bodysuit');
    expect(decodedUrl).toContain('• Price: ₹700');
    expect(decodedUrl).not.toContain('• Price: ₹7\n');

    // 4. Test productService normalization when input is entered as raw rupee 700 or string "700 (Rental)"
    const rawProductWithRupees: Product = {
      ...TEST_LATEX_BODYSUIT,
      slug: 'latex-bodysuit-raw',
      price: 700, // unmultiplied rupees from catalog sheet
    };
    productService.setProducts([rawProductWithRupees]);
    const normalized = productService.getProductBySlug('latex-bodysuit-raw');
    expect(normalized).toBeDefined();
    expect(normalized?.price).toBe(70000); // normalized to 70000 paise
    expect(formatPrice(normalized!.price)).toBe('₹700');
  });
});
