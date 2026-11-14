import { z } from 'zod';

export const adminRoleSchema = z.enum(['owner', 'staff']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  role: adminRoleSchema.default('staff'),
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminLoginSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
export type AdminLoginPayload = z.infer<typeof adminLoginSchema>;

export const adminCreateSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8, 'Owner password must be at least 8 characters'),
  name: z.string().min(2),
  role: adminRoleSchema.default('owner'),
});
export type AdminCreatePayload = z.infer<typeof adminCreateSchema>;

