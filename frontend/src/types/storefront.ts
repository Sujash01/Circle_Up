/**
 * Frontend storefront domain types structured for straightforward future API integration.
 */

export type ProductCategorySlug =
  | 'womens-upperwear'
  | 'womens-bottomwear'
  | 'womens-one-piece'
  | 'mens-upperwear'
  | 'mens-bottomwear'
  | 'footwear'
  | 'ethnic-wear'
  | 'thrifted-treasure'
  | 'jewellery'
  | 'accessories'
  | 'handcrafted';

export type ProductCondition =
  | 'New With Tags'
  | 'Mint'
  | 'Gently Used'
  | 'Vintage Wear'
  | 'Artisan Made';

export type GenderTag = 'Women' | 'Men' | 'Unisex';

export interface ProductVariant {
  id: string;
  label: string;
  size: string;
  color?: string;
  stock: number;
  priceOverride?: number;
}

export interface Product {
  id: string;
  serialNumber?: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  category: ProductCategorySlug;
  categoryLabel: string;
  subcategory: string;
  productType: 'Pre-Loved' | 'Fresh Find' | 'Handcrafted';
  condition: ProductCondition;
  gender: GenderTag;
  sizes: string[];
  variants: ProductVariant[];
  stock: number;
  tags: string[];
  featured: boolean;
  isNewArrival: boolean;
  availability: 'In Stock' | 'Low Stock' | 'Sold Out';
  makerNote?: string;
  measurements?: string;
  createdAt: string;
}

export interface CategoryMeta {
  slug: ProductCategorySlug;
  title: string;
  subtitle: string;
  subcategories: string[];
  supportsGenderFilter?: boolean;
}

export interface RentalProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  categoryLabel: string;
  condition: ProductCondition;
  sizes: string[];
  dailyRate: number;
  securityDeposit: number;
  minDays: number;
  maxDays: number;
  unavailableDates: string[]; // YYYY-MM-DD
  terms: string[];
  availabilityLabel: 'Available' | 'Limited Dates';
}

export interface SimulatedRentalRequest {
  id: string;
  rentalProductId: string;
  rentalProductName: string;
  size: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  estimatedRentalFee: number;
  securityDeposit: number;
  estimatedTotal: number;
  customerName: string;
  customerPhone: string;
  notes?: string;
  createdAt: string;
}

export interface CartItem {
  key: string; // `${productId}::${variantId}`
  productId: string;
  slug: string;
  name: string;
  image: string;
  size: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  maxStock: number;
}

export interface CartState {
  cartId: string;
  items: CartItem[];
  promoCode?: string;
}

export interface ReviewItem {
  id: string;
  displayName: string;
  rating: number;
  title: string;
  comment: string;
  productSlug?: string;
  productName?: string;
  createdAt: string;
  isLocalSubmission?: boolean;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  fullDetails: string;
  date: string;
  time: string;
  location: string;
  image: string;
  spotsLabel: string;
  highlights: string[];
}

export interface EventRegistration {
  id: string;
  eventId: string;
  eventTitle: string;
  name: string;
  email: string;
  phone: string;
  notes?: string;
  createdAt: string;
}

export interface CommunitySubmission {
  id: string;
  displayName: string;
  handle: string;
  caption: string;
  image: string;
  taggedPiece?: string;
  createdAt: string;
  isLocalSubmission?: boolean;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

