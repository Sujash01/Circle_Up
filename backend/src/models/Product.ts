import mongoose, { Document, Schema } from 'mongoose';

export interface IProductDocument extends Document {
  serialNumber: string;
  categoryCode?: string;
  sizeCategory?: string;
  measurementsData?: Record<string, string>;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice?: number;
  compareAtPrice?: number;
  stock: number;
  images: string[];
  sizes: string[];
  category: string;
  categoryLabel?: string;
  subcategory?: string;
  productType: 'Pre-Loved' | 'Fresh Find' | 'Handcrafted' | 'Rental';
  condition: 'New With Tags' | 'Mint' | 'Gently Used' | 'Vintage Wear' | 'Artisan Made';
  gender: 'Women' | 'Men' | 'Unisex';
  measurements?: string;
  makerNote?: string;
  tags: string[];
  featured: boolean;
  isNewArrival: boolean;
  chestPick: boolean;
  badge?: string;
  sku?: string;
  seoTitle?: string;
  seoDescription?: string;
  status:
    | 'AVAILABLE'
    | 'SOLD'
    | 'BOOKED'
    | 'MISSING'
    | 'NEED_ATTENTION'
    | 'EXCHANGE_BARTER'
    | 'RENT'
    | 'ACTIVE'
    | 'PUBLISHED'
    | 'SOLD_OUT'
    | 'DRAFT'
    | 'ARCHIVED';
  variants: Array<{
    id: string;
    label: string;
    size: string;
    stock: number;
    priceOverride?: number;
  }>;
  deletedAt?: Date | null;
  availability: 'In Stock' | 'Low Stock' | 'Sold Out';
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    size: { type: String, required: true },
    stock: { type: Number, required: true, default: 1, min: 0 },
    priceOverride: { type: Number },
  },
  { _id: false },
);

const ProductSchema = new Schema<IProductDocument>(
  {
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    categoryCode: {
      type: String,
      uppercase: true,
      trim: true,
      index: true,
    },
    sizeCategory: {
      type: String,
      trim: true,
    },
    measurementsData: {
      type: Schema.Types.Mixed,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    compareAtPrice: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    images: {
      type: [String],
      required: true,
      default: [],
    },
    sizes: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    categoryLabel: {
      type: String,
      default: '',
    },
    subcategory: {
      type: String,
      default: '',
    },
    productType: {
      type: String,
      enum: ['Pre-Loved', 'Fresh Find', 'Handcrafted', 'Rental'],
      default: 'Pre-Loved',
      index: true,
    },
    condition: {
      type: String,
      enum: ['New With Tags', 'Mint', 'Gently Used', 'Vintage Wear', 'Artisan Made'],
      default: 'Gently Used',
    },
    gender: {
      type: String,
      enum: ['Women', 'Men', 'Unisex'],
      default: 'Unisex',
      index: true,
    },
    measurements: {
      type: String,
      default: '',
    },
    makerNote: {
      type: String,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isNewArrival: {
      type: Boolean,
      default: true,
      index: true,
    },
    chestPick: {
      type: Boolean,
      default: false,
      index: true,
    },
    badge: {
      type: String,
      default: '',
    },
    sku: {
      type: String,
      default: '',
    },
    seoTitle: {
      type: String,
      default: '',
    },
    seoDescription: {
      type: String,
      default: '',
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'AVAILABLE',
        'SOLD',
        'BOOKED',
        'MISSING',
        'NEED_ATTENTION',
        'EXCHANGE_BARTER',
        'RENT',
        'ACTIVE',
        'PUBLISHED',
        'SOLD_OUT',
        'DRAFT',
        'ARCHIVED',
      ],
      default: 'AVAILABLE',
      index: true,
    },
    variants: {
      type: [VariantSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

ProductSchema.virtual('availability').get(function (this: IProductDocument) {
  if (this.stock <= 0 || this.status === 'SOLD_OUT') return 'Sold Out';
  if (this.stock <= 2) return 'Low Stock';
  return 'In Stock';
});

ProductSchema.index({ status: 1, deletedAt: 1, category: 1 });
ProductSchema.index({ status: 1, deletedAt: 1, chestPick: 1 });
ProductSchema.index({ status: 1, deletedAt: 1, isNewArrival: 1 });

// Full-text search index across name, serialNumber, description, subcategory, tags
ProductSchema.index({
  name: 'text',
  serialNumber: 'text',
  description: 'text',
  subcategory: 'text',
  tags: 'text',
});

export const Product: mongoose.Model<IProductDocument> =
  (mongoose.models.Product as mongoose.Model<IProductDocument>) ||
  mongoose.model<IProductDocument>('Product', ProductSchema);
