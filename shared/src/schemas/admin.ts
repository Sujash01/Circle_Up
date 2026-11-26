import { z } from 'zod';
import { AdminPermission } from '../constants/enums.js';

export const adminRoleSchema = z.enum(['owner', 'staff']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ALL_ADMIN_PERMISSIONS = [
  'overview:view',
  'products:view',
  'products:create',
  'products:edit',
  'products:archive',
  'products:copy',
  'products:delete',
  'orders:view',
  'orders:manage',
  'customers:view',
  'customers:manage',
  'coupons:view',
  'coupons:manage',
  'rentals_events:view',
  'rentals_events:manage',
  'inquiries:view',
  'inquiries:manage',
  'settings:view',
  'settings:manage',
  'activity:view',
  'team:manage',
] as const;

export type GranularAdminPermission = (typeof ALL_ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_DEFINITIONS: Record<
  GranularAdminPermission,
  { label: string; module: string; description: string }
> = {
  'overview:view': { module: 'Dashboard', label: 'View Dashboard', description: 'Access dashboard summary and revenue metrics' },
  'products:view': { module: 'Products', label: 'View Products', description: 'Browse and inspect products in catalog' },
  'products:create': { module: 'Products', label: 'Create Products', description: 'Add new pieces and upload photos' },
  'products:edit': { module: 'Products', label: 'Edit Products', description: 'Update product details, sizing, and pricing' },
  'products:archive': { module: 'Products', label: 'Archive / Restore', description: 'Soft-delete and restore products' },
  'products:copy': { module: 'Products', label: 'Duplicate Products', description: 'Clone products into new draft copies' },
  'products:delete': { module: 'Products', label: 'Permanent Delete', description: 'Permanently remove unordered products from database' },
  'orders:view': { module: 'Orders', label: 'View Orders', description: 'Inspect customer orders and details' },
  'orders:manage': { module: 'Orders', label: 'Manage Orders', description: 'Update fulfillment and process inspections' },
  'customers:view': { module: 'Customers', label: 'View Customers', description: 'Browse customer list and history' },
  'customers:manage': { module: 'Customers', label: 'Manage Customers', description: 'Edit customer records and internal notes' },
  'coupons:view': { module: 'Coupons', label: 'View Coupons', description: 'Browse active and expired promotional codes' },
  'coupons:manage': { module: 'Coupons', label: 'Manage Coupons', description: 'Create, update, or remove discount coupons' },
  'rentals_events:view': { module: 'Rentals & Events', label: 'View Rentals & Events', description: 'Inspect bookings and event listings' },
  'rentals_events:manage': { module: 'Rentals & Events', label: 'Manage Rentals & Events', description: 'Create, edit, or delete events and rental items' },
  'inquiries:view': { module: 'Inquiries', label: 'View Contact Inbox', description: 'Read incoming customer inquiries' },
  'inquiries:manage': { module: 'Inquiries', label: 'Manage Inquiries', description: 'Update status and archive inquiries' },
  'settings:view': { module: 'Site Settings', label: 'View Site Settings', description: 'Inspect store configuration and branding' },
  'settings:manage': { module: 'Site Settings', label: 'Manage Site Settings', description: 'Update store settings and options' },
  'activity:view': { module: 'Activity Log', label: 'View Audit Log', description: 'Inspect administrative audit log history' },
  'team:manage': { module: 'Team Access', label: 'Manage Team Accounts', description: 'Create and configure team member access' },
};

export function hasPermission(
  user: { role?: string; permissions?: string[] } | null | undefined,
  permission: AdminPermission | string,
): boolean {
  if (!user) return false;
  if (user.role === 'owner') return true;
  return Array.isArray(user.permissions) && user.permissions.includes(permission);
}

export const adminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1),
  role: adminRoleSchema.default('staff'),
  permissions: z.array(z.string()).default([]),
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
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2),
  role: adminRoleSchema.default('staff'),
  permissions: z.array(z.string()).optional(),
});
export type AdminCreatePayload = z.infer<typeof adminCreateSchema>;

export const adminUpdateUserSchema = z.object({
  email: z.string().email().trim().toLowerCase().optional(),
  name: z.string().min(1).trim().optional(),
  role: adminRoleSchema.optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
  permissions: z.array(z.string()).optional(),
});
export type AdminUpdateUserPayload = z.infer<typeof adminUpdateUserSchema>;
