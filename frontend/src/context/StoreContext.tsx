import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cartService, type CartTotals } from '@/services/cartService';
import { productService } from '@/services/productService';
import { wishlistService } from '@/services/wishlistService';
import type { CartState, Product, ProductVariant } from '@/types/storefront';

interface StoreNotice {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface StoreContextValue {
  cart: CartState;
  totals: CartTotals;
  wishlistIds: string[];
  wishlistProducts: Product[];
  isSearchOpen: boolean;
  notice: StoreNotice | null;
  openSearch: () => void;
  closeSearch: () => void;
  dismissNotice: () => void;
  showNotice: (text: string, tone?: 'info' | 'error') => void;
  addToCart: (
    product: Product,
    variant: ProductVariant,
    quantity?: number,
  ) => { ok: boolean; error?: string };
  updateCartQuantity: (key: string, quantity: number) => void;
  removeFromCart: (key: string) => void;
  applyPromoCode: (code: string) => { ok: boolean; error?: string };
  clearCart: () => void;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (productId: string, productName?: string) => void;
  removeFromWishlist: (productId: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(() => cartService.loadCart());
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => wishlistService.loadIds());
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [notice, setNotice] = useState<StoreNotice | null>(null);
  const [, setCatalogVersion] = useState(0);

  useEffect(() => {
    return productService.subscribe(() => setCatalogVersion((v) => v + 1));
  }, []);

  const showNotice = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setNotice({ id: Date.now(), text, tone });
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const totals = useMemo(() => cartService.calculateTotals(cart), [cart]);

  const wishlistProducts = useMemo(
    () =>
      wishlistIds
        .map((id) => productService.getProductById(id))
        .filter((item): item is Product => Boolean(item)),
    [wishlistIds],
  );

  const addToCart = useCallback(
    (product: Product, variant: ProductVariant, quantity = 1) => {
      const result = cartService.addItem(cart, product, variant, quantity);
      if (result.error) {
        showNotice(result.error, 'error');
        return { ok: false, error: result.error };
      }
      setCart(result.nextState);
      showNotice(`Added "${product.name}" (${variant.size}) to bag.`);
      return { ok: true };
    },
    [cart, showNotice],
  );

  const updateCartQuantity = useCallback(
    (key: string, quantity: number) => {
      setCart((prev) => cartService.updateQuantity(prev, key, quantity));
    },
    [],
  );

  const removeFromCart = useCallback(
    (key: string) => {
      setCart((prev) => cartService.removeItem(prev, key));
      showNotice('Removed item from bag.');
    },
    [showNotice],
  );

  const applyPromoCode = useCallback(
    (code: string) => {
      const result = cartService.applyPromoCode(cart, code);
      if (result.error) {
        return { ok: false, error: result.error };
      }
      setCart(result.nextState);
      showNotice(
        result.nextState.promoCode
          ? `Code ${result.nextState.promoCode} applied.`
          : 'Promo code cleared.',
      );
      return { ok: true };
    },
    [cart, showNotice],
  );

  const clearCart = useCallback(() => {
    setCart(cartService.clearCart());
    showNotice('Bag cleared.');
  }, [showNotice]);

  const isWishlisted = useCallback(
    (productId: string) => wishlistIds.includes(productId),
    [wishlistIds],
  );

  const toggleWishlist = useCallback(
    (productId: string, productName?: string) => {
      setWishlistIds((prev) => {
        const existed = prev.includes(productId);
        const next = wishlistService.toggleId(prev, productId);
        showNotice(
          existed
            ? `Removed ${productName ? `"${productName}" ` : ''}from wishlist.`
            : `Saved ${productName ? `"${productName}" ` : ''}to wishlist.`,
        );
        return next;
      });
    },
    [showNotice],
  );

  const removeFromWishlist = useCallback((productId: string) => {
    setWishlistIds((prev) => wishlistService.removeId(prev, productId));
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      totals,
      wishlistIds,
      wishlistProducts,
      isSearchOpen,
      notice,
      openSearch: () => setIsSearchOpen(true),
      closeSearch: () => setIsSearchOpen(false),
      dismissNotice,
      showNotice,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      applyPromoCode,
      clearCart,
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
    }),
    [
      cart,
      totals,
      wishlistIds,
      wishlistProducts,
      isSearchOpen,
      notice,
      dismissNotice,
      showNotice,
      addToCart,
      updateCartQuantity,
      removeFromCart,
      applyPromoCode,
      clearCart,
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}

