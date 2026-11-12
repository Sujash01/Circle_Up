import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItemDocument {
  serialNumber: string;
  productId?: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  size?: string;
  image?: string;
  slug?: string;
}

export interface IOrderDocument extends Document {
  orderNumber: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    addressLine: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    landmark?: string;
  };
  items: IOrderItemDocument[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalAmount: number;
  status: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  paymentMethod: 'WHATSAPP_UPI' | 'CASH_ON_DELIVERY' | 'ONLINE_UPI';
  paymentStatus: 'PENDING' | 'PAID';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema(
  {
    serialNumber: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    size: { type: String, default: '' },
    image: { type: String, default: '' },
    slug: { type: String, default: '' },
  },
  { _id: false },
);

const OrderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, trim: true },
    },
    shippingAddress: {
      addressLine: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, default: 'India', trim: true },
      landmark: { type: String, default: '', trim: true },
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: [(v: IOrderItemDocument[]) => v.length > 0, 'Order must contain at least one item'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      default: 'CONFIRMED',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['WHATSAPP_UPI', 'CASH_ON_DELIVERY', 'ONLINE_UPI'],
      default: 'WHATSAPP_UPI',
    },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID'],
      default: 'PENDING',
    },
    notes: { type: String, default: '' },
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

export const Order: mongoose.Model<IOrderDocument> =
  (mongoose.models.Order as mongoose.Model<IOrderDocument>) ||
  mongoose.model<IOrderDocument>('Order', OrderSchema);
