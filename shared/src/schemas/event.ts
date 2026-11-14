import { z } from 'zod';

export const storeEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: z.string().min(1),
  location: z.string().min(1),
  description: z.string(),
  image: z.string().optional(),
  type: z.enum(['POP_UP', 'COMMUNITY', 'OFFLINE_SALE']).default('POP_UP'),
  capacity: z.number().int().positive().optional(),
  registeredCount: z.number().int().nonnegative().default(0),
  isRegistrationOpen: z.boolean().default(true),
});
export type StoreEvent = z.infer<typeof storeEventSchema>;

