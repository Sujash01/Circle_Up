import mongoose, { Document, Schema } from 'mongoose';

export interface IEventDocument extends Document {
  title: string;
  date: string;
  location: string;
  description: string;
  image?: string;
  type: 'POP_UP' | 'COMMUNITY' | 'OFFLINE_SALE';
  capacity?: number;
  registeredCount: number;
  isRegistrationOpen: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEventDocument>(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    image: { type: String, default: '' },
    type: {
      type: String,
      enum: ['POP_UP', 'COMMUNITY', 'OFFLINE_SALE'],
      default: 'POP_UP',
      index: true,
    },
    capacity: { type: Number },
    registeredCount: { type: Number, default: 0, min: 0 },
    isRegistrationOpen: { type: Boolean, default: true, index: true },
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

export const Event: mongoose.Model<IEventDocument> =
  (mongoose.models.Event as mongoose.Model<IEventDocument>) ||
  mongoose.model<IEventDocument>('Event', EventSchema);
