import { beforeEach, describe, expect, it } from 'vitest';
import type { Product, RentalProduct } from '../src/types/storefront';
import {
  communityService,
  contactService,
  eventService,
  reviewService,
} from '../src/services/communityServices';
import { cartService, formatInr, formatPrice } from '../src/services/cartService';
import { productService } from '../src/services/productService';
import { rentalService } from '../src/services/rentalService';
import { wishlistService } from '../src/services/wishlistService';

const MOCK_PRODUCTS: Product[] = [
  {
    id: 'cu-test-01',
    serialNumber: 'CU-TEST-001',
    name: 'Plaid Halter Corset Top',
    slug: 'plaid-halter-corset-top',
    category: 'womens-upperwear',
    categoryLabel: 'Women',
    subcategory: 'Corsets',
    productType: 'Pre-Loved',
    price: 1850,
    originalPrice: 2200,
    images: ['/test-corset.jpg'],
    condition: 'Vintage Wear',
    gender: 'Women',
    sizes: ['S'],
    stock: 1,
    featured: true,
    isNewArrival: true,
    availability: 'In Stock',
    description: 'Test vintage plaid corset.',
    measurements: 'Bust: 34 in, Length: 16 in',
    makerNote: 'Authentic 90s piece.',
    variants: [{ id: 'var-1', size: 'S', stock: 1, label: 'Small' }],
    tags: ['vintage', 'corset'],
    createdAt: '2026-11-15T00:00:00Z',
  },
  {
    id: 'cu-test-02',
    serialNumber: 'CU-TEST-002',
    name: 'Denim Jumpsuit Co-Ord Set',
    slug: 'denim-jumpsuit-co-ord-set',
    category: 'womens-one-piece',
    categoryLabel: 'Women',
    subcategory: 'Jumpsuits',
    productType: 'Pre-Loved',
    price: 4950,
    originalPrice: 5500,
    images: ['/test-jumpsuit.jpg'],
    condition: 'Mint',
    gender: 'Women',
    sizes: ['M'],
    stock: 1,
    featured: true,
    isNewArrival: false,
    availability: 'In Stock',
    description: 'Test denim jumpsuit.',
    measurements: 'Bust: 36 in, Length: 54 in',
    makerNote: 'Vintage Japanese denim.',
    variants: [{ id: 'var-2', size: 'M', stock: 1, label: 'Medium' }],
    tags: ['denim', 'jumpsuit'],
    createdAt: '2026-11-15T00:00:00Z',
  },
];

const MOCK_RENTALS: RentalProduct[] = [
  {
    id: 'rnt-test-01',
    name: 'Embroidered Velvet Sherwani',
    slug: 'embroidered-velvet-sherwani',
    categoryLabel: 'Ethnic & Festive',
    dailyRate: 1500,
    securityDeposit: 3000,
    minDays: 2,
    maxDays: 14,
    images: ['/test-rental.jpg'],
    condition: 'Mint',
    sizes: ['M', 'L'],
    unavailableDates: ['2026-11-18', '2026-11-19', '2026-11-20'],
    description: 'Test rental item',
    terms: ['Dry clean before return'],
    availabilityLabel: 'Available',
  },
];

describe('CircleUp Storefront Services & LocalStorage Persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    productService.setProducts(MOCK_PRODUCTS);
    rentalService.setRentalProducts(MOCK_RENTALS);
  });

  it('filters, searches, and sorts catalog products accurately', () => {
    const all = productService.getAllProducts();
    expect(all.length).toBeGreaterThanOrEqual(2);

    const corsets = productService.queryProducts({
      category: 'womens-upperwear',
      subcategory: 'Corsets',
    });
    expect(corsets.length).toBeGreaterThanOrEqual(1);
    expect(corsets[0]?.slug).toBe('plaid-halter-corset-top');

    const sortedAsc = productService.queryProducts({ sort: 'price-asc' });
    expect(sortedAsc[0]!.price).toBeLessThanOrEqual(sortedAsc[sortedAsc.length - 1]!.price);

    const searchDenim = productService.queryProducts({ search: 'jumpsuit' });
    expect(searchDenim.some((p) => p.slug === 'denim-jumpsuit-co-ord-set')).toBe(true);

    const emptySearch = productService.queryProducts({ search: 'nonexistent-xyz-999' });
    expect(emptySearch).toHaveLength(0);
  });

  it('persists cart in LocalStorage, enforces stock limits, calculates discounts, and formats WhatsApp checkout', () => {
    expect(formatPrice(4000)).toBe('₹4,000');
    expect(formatPrice(123456)).toBe('₹1,23,456');
    expect(formatPrice(1950.5)).toBe('₹1,950.5');
    expect(formatInr(4000)).toBe(formatPrice(4000));

    const initial = cartService.loadCart();
    expect(initial.cartId).toMatch(/^CU-CART-\d{8}-[A-Z0-9]{4}$/);

    const product = productService.getProductBySlug('denim-jumpsuit-co-ord-set')!;
    const variant = product.variants[0]!; // stock: 1

    const add1 = cartService.addItem(initial, product, variant, 1);
    expect(add1.error).toBeUndefined();
    expect(add1.nextState.items).toHaveLength(1);

    // Attempting to exceed stock=1 is blocked
    const add2 = cartService.addItem(add1.nextState, product, variant, 1);
    expect(add2.error).toBeDefined();

    // Promo code calculation (CIRCLE20 -> 20% off orders >= 1500)
    const promo = cartService.applyPromoCode(add1.nextState, 'CIRCLE20');
    expect(promo.error).toBeUndefined();

    const reloaded = cartService.loadCart();
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.promoCode).toBe('CIRCLE20');

    const wa = cartService.buildWhatsAppCheckout(reloaded, 'Deliver to Bandra');
    expect(wa.totals.subtotal).toBe(4950);
    expect(wa.totals.discount).toBe(990);
    expect(wa.totals.estimatedTotal).toBe(3960);
    expect(wa.message).toContain(reloaded.cartId);
    expect(wa.message).toContain('Denim Jumpsuit Co-Ord Set');
    expect(wa.url).toContain('https://wa.me/');
  });

  it('persists wishlist items across reloads', () => {
    const ids1 = wishlistService.toggleId([], 'cu-001');
    expect(ids1).toEqual(['cu-001']);
    expect(wishlistService.loadIds()).toEqual(['cu-001']);

    const ids2 = wishlistService.toggleId(ids1, 'cu-001');
    expect(ids2).toEqual([]);
  });

  it('validates rental date conflicts, duration limits, deposits, and local request persistence', () => {
    const rental = rentalService.getAllRentalProducts()[0]!; // minDays: 2, unavailable includes 2026-11-18..20

    // Overlapping blocked date fails
    const conflict = rentalService.evaluateQuote(rental, '2026-11-18', '2026-11-20');
    expect(conflict.valid).toBe(false);
    expect(conflict.conflictingDates).toContain('2026-11-18');

    // Valid future non-conflicting range calculates fee + deposit
    const valid = rentalService.evaluateQuote(rental, '2027-01-10', '2027-01-12'); // 3 days
    expect(valid.valid).toBe(true);
    expect(valid.durationDays).toBe(3);
    expect(valid.estimatedRentalFee).toBe(3 * rental.dailyRate);
    expect(valid.estimatedTotal).toBe(3 * rental.dailyRate + rental.securityDeposit);

    // Submitting simulated request blocks those dates locally for subsequent attempts
    const saved = rentalService.submitSimulatedRequest({
      product: rental,
      size: 'M',
      startDate: '2027-01-10',
      endDate: '2027-01-12',
      customerName: 'Aanya',
      customerPhone: '+919820112233',
    });
    expect(saved.request?.id).toMatch(/^SIM-RNT-/);

    const recheck = rentalService.evaluateQuote(rental, '2027-01-11', '2027-01-13');
    expect(recheck.valid).toBe(false);
  });

  it('persists simulated reviews, event registrations, contact messages, and #ThriftCrew previews', () => {
    const review = reviewService.submitReview({
      displayName: 'Kavya',
      rating: 5,
      title: 'Great denim find',
      comment: 'Super clean vintage wash and accurate sizing notes.',
    });
    expect(review.isLocalSubmission).toBe(true);
    expect(reviewService.getAllReviews()[0]?.id).toBe(review.id);

    const evt = eventService.getAllEvents()[0]!;
    const reg = eventService.registerForEvent({
      event: evt,
      name: 'Kavya',
      email: 'kavya@example.com',
      phone: '+919800112233',
    });
    expect(reg.registration?.id).toMatch(/^SIM-EVT-/);
    // Duplicate local email blocked
    const dup = eventService.registerForEvent({
      event: evt,
      name: 'Kavya',
      email: 'kavya@example.com',
      phone: '+919800112233',
    });
    expect(dup.error).toBeDefined();

    const contact = contactService.saveSubmission({
      name: 'Kavya',
      email: 'kavya@example.com',
      subject: 'Sizing question',
      message: 'Could you share shoulder width for blazer?',
    });
    expect(contact.savedToStorage).toBe(true);

    const crew = communityService.submitPost({
      displayName: 'Kavya',
      handle: 'kavya.thrifts',
      caption: 'Layered denim for weekend swap!',
      image: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(crew.savedToStorage).toBe(true);
    expect(communityService.getLocalSubmissions()[0]?.handle).toBe('@kavya.thrifts');
  });
});

