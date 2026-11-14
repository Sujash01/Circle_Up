import mongoose, { Document, Schema } from 'mongoose';

export interface IRentalDocument extends Document {
  name: string;
  slug: string;
  category: string;
  image: string;
  rentalPrice3Days: number;
  rentalPrice7Days: number;
  rentalPrice14Days: number;
  securityDeposit: number;
  condition: string;
  size: string;
  isAvailable: boolean;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const RentalSchema = new Schema<IRentalDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    category: { type: String, default: 'rentals' },
    image: { type: String, required: true },
    rentalPrice3Days: { type: Number, required: true, min: 0 },
    rentalPrice7Days: { type: Number, required: true, min: 0 },
    rentalPrice14Days: { type: Number, required: true, min: 0 },
    securityDeposit: { type: Number, required: true, min: 0 },
    condition: { type: String, default: 'Mint' },
    size: { type: String, default: 'One Size' },
    isAvailable: { type: Boolean, default: true, index: true },
    description: { type: String, default: '' },
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

export const Rental: mongoose.Model<IRentalDocument> =
  (mongoose.models.Rental as mongoose.Model<IRentalDocument>) ||
  mongoose.model<IRentalDocument>('Rental', RentalSchema);
