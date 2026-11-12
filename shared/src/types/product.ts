export interface IProductItem {
  id?: string;
  serialNumber: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  stock: number;
  images: string[];
  sizes: string[];
  category: string;
  categoryLabel?: string;
  subcategory?: string;
  productType?: 'Pre-Loved' | 'Fresh Find' | 'Handcrafted' | 'Rental';
  condition?: 'New With Tags' | 'Mint' | 'Gently Used' | 'Vintage Wear' | 'Artisan Made';
  gender?: 'Women' | 'Men' | 'Unisex';
  measurements?: string;
  makerNote?: string;
  tags?: string[];
  featured?: boolean;
  isNewArrival?: boolean;
  status?: 'ACTIVE' | 'SOLD_OUT' | 'DRAFT' | 'ARCHIVED';
  variants?: Array<{
    id: string;
    label: string;
    size: string;
    stock: number;
    priceOverride?: number;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductListQuery {
  category?: string;
  subcategory?: string;
  condition?: string;
  gender?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  newArrivalsOnly?: boolean;
  featuredOnly?: boolean;
  search?: string;
  sort?: 'newest' | 'price-asc' | 'price-desc';
  page?: number;
  limit?: number;
}

