import { z } from 'zod';
import { moneyPaiseSchema, normalizePriceToPaise } from './money.js';

const coercedPaiseSchema = z.preprocess(
  (val) => (typeof val === 'number' && Number.isSafeInteger(val) && val >= 5000 ? val : normalizePriceToPaise(val)),
  moneyPaiseSchema,
);

// Existing rental data contract retained for storefront callers.
export const rentalItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string().default('rentals'),
  image: z.string(),
  rentalPrice3Days: coercedPaiseSchema,
  rentalPrice7Days: coercedPaiseSchema,
  rentalPrice14Days: coercedPaiseSchema,
  securityDeposit: coercedPaiseSchema,
  condition: z.string().default('Mint'),
  size: z.string().default('One Size'),
  isAvailable: z.boolean().default(true),
  description: z.string().optional(),
});
export type RentalItem = z.infer<typeof rentalItemSchema>;

export const rentalCatalogItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(220).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().trim().min(1).max(100).default('rentals'),
  image: z.string().trim().min(1).max(2048),
  rentalPrice3Days: coercedPaiseSchema,
  rentalPrice7Days: coercedPaiseSchema,
  rentalPrice14Days: coercedPaiseSchema,
  securityDeposit: coercedPaiseSchema,
  condition: z.string().trim().min(1).max(80).default('Mint'),
  size: z.string().trim().min(1).max(80).default('One Size'),
  isAvailable: z.boolean().default(true),
  description: z.string().max(5000).default(''),
}).strict();

export type RentalCatalogItem = z.infer<typeof rentalCatalogItemSchema>;
