import { calculateCheckoutDeliveryFee, formatPrice, normalizeBusinessWhatsappNumber, formatDisplaySerial } from '@circleup/shared';
import type { CartItem, CartState, Product, ProductVariant } from '@/types/storefront';
export type { CartItem, CartState };
import { readStorage, writeStorage } from './storage';
import { productService } from './productService';

const CART_STORAGE_KEY = 'circleup_cart_v1';

export function buildBusinessWhatsappUrl(businessNumber: string | undefined, message?: string): string | undefined {
  const number = normalizeBusinessWhatsappNumber(businessNumber);
  if (!number) return undefined;
  const destination = `https://wa.me/${number}`;
  return message ? `${destination}?text=${encodeURIComponent(message)}` : destination;
}

export function getCartItemSerialNumber(item: CartItem): string {
  return formatDisplaySerial(
    item.serialNumber || productService.getProductById(item.productId)?.serialNumber || productService.getProductBySlug(item.slug)?.serialNumber,
    item.productId
  );
}

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
  deliveryFee: number;
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
            serialNumber: product.serialNumber,
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
    const nextState = { ...state, promoCode: normalized };
    return { nextState: this.saveCart(nextState) };
  },

  clearCart(): CartState {
    const fresh: CartState = { cartId: generateCartId(), items: [] };
    return this.saveCart(fresh);
  },

  calculateTotals(state: CartState, verifiedDiscountInPaise = 0): CartTotals {
    const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = state.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const discount = Math.min(subtotal, verifiedDiscountInPaise);
    const discountedSubtotal = subtotal - discount;
    const deliveryFee = calculateCheckoutDeliveryFee(discountedSubtotal, itemCount);

    return {
      itemCount,
      subtotal,
      discount,
      discountLabel: discount > 0 ? state.promoCode : undefined,
      deliveryFee,
      estimatedTotal: discountedSubtotal + deliveryFee,
    };
  },

  buildWhatsAppCheckout(state: CartState, customerNote = '', estimatedTotals?: CartTotals, businessNumber?: string): {
    message: string;
    url: string | undefined;
    totals: CartTotals;
  } {
    const totals = estimatedTotals ?? this.calculateTotals(state);
    const itemLines = state.items.map(
      (item, idx) =>
        `${idx + 1}. ${item.name} (Ref: ${getCartItemSerialNumber(item)}, Size: ${item.size}) x${item.quantity} — ${formatPrice(
          item.unitPrice * item.quantity,
        )}`,
    );

    const lines = [
      'Hi CircleUp! I would like to enquire about purchasing:',
      `Cart ID: ${state.cartId}`,
      '',
      ...itemLines,
      '',
      `Subtotal: ${formatPrice(totals.subtotal)}`,
      ...(totals.discount > 0
        ? [`Discount (${totals.discountLabel}): -${formatPrice(totals.discount)}`]
        : []),
      `Estimated Shipping: ${formatPrice(totals.deliveryFee)}`,
      `Estimated Total: ${formatPrice(totals.estimatedTotal)}`,
      ...(customerNote.trim() ? ['', `Note: ${customerNote.trim()}`] : []),
      '',
      '(Please confirm availability and payment details.)',
    ];

    const message = lines.join('\n');
    return { message, url: buildBusinessWhatsappUrl(businessNumber, message), totals };
  },

  buildProductWhatsAppUrl(
    product: Product,
    variantLabel?: string,
    businessNumber?: string,
    selection?: { size: string; quantity: number; unitPrice: number },
  ): string | undefined {
    const quantity = selection?.quantity ?? 1;
    const unitPrice = selection?.unitPrice ?? product.price;
    const subtotal = unitPrice * quantity;
    const shipping = calculateCheckoutDeliveryFee(subtotal, quantity);
    const lines = [
      'Hi CircleUp! I would like to enquire about this piece:',
      `• ${product.name}${variantLabel ? ` (${variantLabel})` : ''}`,
      `• Price: ${formatPrice(unitPrice)}`,
      `• Ref: ${formatDisplaySerial(product.serialNumber, product.id)}`,
      ...(selection ? [`• Size: ${selection.size}`] : []),
      `• Quantity: ${quantity}`,
      `Estimated Shipping: ${formatPrice(shipping)}`,
      `Estimated Total: ${formatPrice(subtotal + shipping)}`,
      `• Link: ${typeof window !== 'undefined' ? window.location.href : `https://circleuponline.com/product/${product.slug}`}`,
      '',
      'Is this piece currently available?',
    ];
    return buildBusinessWhatsappUrl(businessNumber, lines.join('\n'));
  },
};

