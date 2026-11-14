import mongoose, { Document, Schema } from 'mongoose';

export interface ISiteSettingsDocument extends Document {
  announcementText: string;
  marqueePhrases: string[];
  storeAddress: string;
  contactEmail: string;
  contactPhone: string;
  whatsappNumber: string;
  contentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const SiteSettingsSchema = new Schema<ISiteSettingsDocument>(
  {
    announcementText: {
      type: String,
      default: 'Use code THRIFT10 or CIRCLE20 in bag • Plastic-free sustainable packaging on every parcel',
    },
    marqueePhrases: {
      type: [String],
      default: [
        'Thrifted with care',
        'Rentals for every occasion',
        'Handcrafted pieces',
        'Plastic-free packaging',
        'Community sale days',
        'Fashion that lasts',
      ],
    },
    storeAddress: {
      type: String,
      default: 'CircleUp Studio Courtyard, Sector 7, Chandigarh',
    },
    contactEmail: {
      type: String,
      default: 'care@circleuponline.com',
    },
    contactPhone: {
      type: String,
      default: '+91 98765 43210',
    },
    whatsappNumber: {
      type: String,
      default: '+919876543210',
    },
    contentVersion: {
      type: Number,
      default: 1,
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

export const SiteSettings: mongoose.Model<ISiteSettingsDocument> =
  (mongoose.models.SiteSettings as mongoose.Model<ISiteSettingsDocument>) ||
  mongoose.model<ISiteSettingsDocument>('SiteSettings', SiteSettingsSchema);
