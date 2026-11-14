import type { CartItem, CartState, Product, ProductVariant } from '@/types/storefront';
import { readStorage, writeStorage } from './storage';

const CART_STORAGE_KEY = 'circleup_cart_v1';

/**
 * Configurable placeholder WhatsApp business number (replace before production launch).
 */
export const WHATSAPP_BUSINESS_NUMBER =
  import.meta.env.VITE_WHATSAPP_NUMBER || '910000000000';

export function formatPrice(amount: number): string {
  return `${String.fromCodePoint(0x20b9)}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** @deprecated Use formatPrice for all storefront price labels. */
export const formatInr = formatPrice

export function generateCartId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CU-CART-${y}${m}${d}-${rand}`;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  discount: number;
  discountLabel?: string;
  estimatedTotal: number;
}

export const cartService = {
  loadCart(): CartState {
    const stored = readStorage<CartState | null>(CART_STORAGE_KEY, null);
    if (stored && typeof stored.cartId === 'string' && Array.isArray(stored.items)) {
      return stored;
    }
    const fresh: CartState = { cartId: generateCartId(), items: [] };
    writeStorage(CART_STORAGE_KEY, fresh);
    return fresh;
  },

  saveCart(state: CartState): CartState {
    writeStorage(CART_STORAGE_KEY, state);
    return state;
  },

  addItem(
    state: CartState,
    product: Product,
    variant: ProductVariant,
    quantity: number,
  ): { nextState: CartState; error?: string } {
    if (variant.stock <= 0) {
      return { nextState: state, error: 'Selected size/variant is currently out of stock.' };
    }

    const key = `${product.id}::${variant.id}`;
    const unitPrice = variant.priceOverride ?? product.price;
    const existing = state.items.find((item) => item.key === key);
    const requestedTotal = (existing?.quantity ?? 0) + quantity;

    if (requestedTotal > variant.stock) {
      return {
        nextState: state,
        error: `Only ${variant.stock} unit${variant.stock > 1 ? 's' : ''} available for ${variant.label}.`,
      };
    }

    const nextItems: CartItem[] = existing
      ? state.items.map((item) =>
          item.key === key ? { ...item, quantity: requestedTotal } : item,
        )
      : [
          ...state.items,
          {
            key,
            productId: product.id,
            slug: product.slug,
            name: product.name,
            image: product.images[0] ?? '',
            size: variant.size,
            variantLabel: variant.label,
            unitPrice,
            quantity,
            maxStock: variant.stock,
          },
        ];

    const nextState: CartState = {
      ...state,
      cartId: state.cartId || generateCartId(),
      items: nextItems,
    };
    this.saveCart(nextState);
    return { nextState };
  },

  updateQuantity(state: CartState, key: string, quantity: number): CartState {
    const nextItems =
      quantity <= 0
        ? state.items.filter((item) => item.key !== key)
        : state.items.map((item) =>
            item.key === key
              ? { ...item, quantity: Math.min(Math.max(1, quantity), item.maxStock) }
              : item,
          );

    const nextState = { ...state, items: nextItems };
    return this.saveCart(nextState);
  },

  removeItem(state: CartState, key: string): CartState {
    const nextState = {
      ...state,
      items: state.items.filter((item) => item.key !== key),
    };
    return this.saveCart(nextState);
  },

  applyPromoCode(
    state: CartState,
    rawCode: string,
  ): { nextState: CartState; error?: string } {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) {
      const nextState = { ...state, promoCode: undefined };
      return { nextState: this.saveCart(nextState) };
    }
    if (normalized !== 'THRIFT10' && normalized !== 'CIRCLE20') {
      return {
        nextState: state,
        error: 'Invalid code. Try THRIFT10 (10% off) or CIRCLE20 (20% off orders ₹1,500+).',
      };
    }
    const nextState = { ...state, promoCode: normalized };
    return { nextState: this.saveCart(nextState) };
  },

  clearCart(): CartState {
    const fresh: CartState = { cartId: generateCartId(), items: [] };
    return this.saveCart(fresh);
  },

  calculateTotals(state: CartState): CartTotals {
    const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = state.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    let discount = 0;
    let discountLabel: string | undefined;

    if (state.promoCode === 'THRIFT10' && subtotal > 0) {
      discount = Math.round(subtotal * 0.1);
      discountLabel = 'THRIFT10 (10% off)';
    } else if (state.promoCode === 'CIRCLE20' && subtotal >= 1500) {
      discount = Math.round(subtotal * 0.2);
      discountLabel = 'CIRCLE20 (20% off)';
    }

    return {
      itemCount,
      subtotal,
      discount,
      discountLabel,
      estimatedTotal: Math.max(0, subtotal - discount),
    };
  },

  buildWhatsAppCheckout(state: CartState, customerNote = ''): {
    message: string;
    url: string;
    totals: CartTotals;
  } {
    const totals = this.calculateTotals(state);
    const itemLines = state.items.map(
      (item, idx) =>
        `${idx + 1}. ${item.name} (${item.variantLabel}) x${item.quantity} — ${formatInr(
          item.unitPrice * item.quantity,
        )}`,
    );

    const lines = [
      'Hi CircleUp! I would like to enquire about purchasing:',
      `Cart ID: ${state.cartId}`,
      '',
      ...itemLines,
      '',
      `Subtotal: ${formatInr(totals.subtotal)}`,
      ...(totals.discount > 0
        ? [`Discount (${totals.discountLabel}): -${formatInr(totals.discount)}`]
        : []),
      `Estimated Total: ${formatInr(totals.estimatedTotal)}`,
      ...(customerNote.trim() ? ['', `Note: ${customerNote.trim()}`] : []),
      '',
      '(Please confirm availability and payment details.)',
    ];

    const message = lines.join('\n');
    const url = `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`;
    return { message, url, totals };
  },
};

