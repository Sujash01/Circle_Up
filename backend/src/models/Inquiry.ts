import mongoose, { Document, Schema } from 'mongoose';

export interface IInquiryDocument extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'NEW' | 'RESOLVED';
  createdAt: Date;
  updatedAt: Date;
}

const InquirySchema = new Schema<IInquiryDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['NEW', 'RESOLVED'], default: 'NEW' },
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

export const Inquiry: mongoose.Model<IInquiryDocument> =
  (mongoose.models.Inquiry as mongoose.Model<IInquiryDocument>) ||
  mongoose.model<IInquiryDocument>('Inquiry', InquirySchema);
