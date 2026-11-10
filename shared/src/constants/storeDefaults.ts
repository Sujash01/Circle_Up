/**
 * Locked-in operational defaults per Section 24.4 of CIRCLEUP_SYSTEM_DESIGN.md.
 */
export const STORE_DEFAULTS = {
  CURRENCY: 'INR',
  TIMEZONE: 'Asia/Kolkata',
  ALLOW_GUEST_CHECKOUT: false,
  REQUIRE_EMAIL_VERIFICATION_FOR: {
    CHECKOUT: false,
    RENTALS: true,
    REVIEWS: true,
    COMMUNITY_POSTS: true,
  },
  RENTAL_TURNAROUND_BUFFER_DAYS: 2,
  RESERVATION_EXPIRY_HOURS: 24,
  CHECKOUT_REQUEST_EXPIRY_DAYS: 7,
  DEFAULT_PAGINATION_LIMIT: 20,
  MAX_PAGINATION_LIMIT: 100,
  MAX_USER_ADDRESSES: 10,
  FEATURE_FLAGS: {
    COUPONS_ENABLED: false,
    STAFF_MANAGEMENT_ENABLED: false,
    RAZORPAY_ENABLED: false,
  },
} as const;

export const PUBLIC_STOREFRONT_CATEGORY_SLUGS = [
  'womens-upperwear',
  'womens-bottomwear',
  'womens-one-piece',
  'mens-upperwear',
  'mens-bottomwear',
  'footwear',
  'ethnic-wear',
  'thrifted-treasure',
  'jewellery',
  'accessories',
  'handcrafted',
] as const;

export type PublicStorefrontCategorySlug =
  (typeof PUBLIC_STOREFRONT_CATEGORY_SLUGS)[number];

