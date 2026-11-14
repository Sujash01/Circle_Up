import { z } from 'zod';

export const customerTierSchema = z.enum(['NEW', 'REGULAR', 'VIP', 'COMMUNITY']);
export type CustomerTier = z.infer<typeof customerTierSchema>;

export const customerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  totalOrders: z.number().int().nonnegative().default(0),
  totalSpendInPaise: z.number().int().nonnegative().default(0),
  firstOrderAt: z.string().optional(),
  lastOrderAt: z.string().optional(),
  tier: customerTierSchema.default('NEW'),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  addressLine: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(),
});

export type Customer = z.infer<typeof customerSchema>;

