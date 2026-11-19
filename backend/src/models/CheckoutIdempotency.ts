import mongoose, { Document, Schema } from 'mongoose';

interface ICheckoutIdempotencyDocument extends Document {
  keyHash: string;
  fingerprint: string;
  orderNumber: string;
  expiresAt: Date;
}

const CheckoutIdempotencySchema = new Schema({
  keyHash: { type: String, required: true },
  fingerprint: { type: String, required: true },
  orderNumber: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, autoIndex: false });

CheckoutIdempotencySchema.index({ keyHash: 1 }, { unique: true, name: 'checkout_idempotency_key_unique' });
CheckoutIdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'checkout_idempotency_expiry_ttl' });

export const CheckoutIdempotency: mongoose.Model<ICheckoutIdempotencyDocument> =
  (mongoose.models.CheckoutIdempotency as mongoose.Model<ICheckoutIdempotencyDocument>) ||
  mongoose.model<ICheckoutIdempotencyDocument>('CheckoutIdempotency', CheckoutIdempotencySchema);
