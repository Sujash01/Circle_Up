import mongoose, { Document, Schema } from 'mongoose';

export interface IAdminUserDocument extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: 'owner' | 'staff';
  isActive: boolean;
  failedAttempts: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUserSchema = new Schema<IAdminUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['owner', 'staff'],
      default: 'staff',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  },
);

export const AdminUser: mongoose.Model<IAdminUserDocument> =
  (mongoose.models.AdminUser as mongoose.Model<IAdminUserDocument>) ||
  mongoose.model<IAdminUserDocument>('AdminUser', AdminUserSchema);

