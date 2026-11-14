import { z } from 'zod';
import { moneyPaiseSchema } from './money.js';

export const rentalItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string().default('rentals'),
  image: z.string(),
  rentalPrice3Days: moneyPaiseSchema,
  rentalPrice7Days: moneyPaiseSchema,
  rentalPrice14Days: moneyPaiseSchema,
  securityDeposit: moneyPaiseSchema,
  condition: z.string().default('Mint'),
  size: z.string().default('One Size'),
  isAvailable: z.boolean().default(true),
  description: z.string().optional(),
});
export type RentalItem = z.infer<typeof rentalItemSchema>;

