import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  itemCount: z.number().int().nonnegative().default(0),
  subcategories: z.array(z.string()).default([]),
  featuredImage: z.string().optional(),
  order: z.number().int().default(0),
});
export type Category = z.infer<typeof categorySchema>;

export const collectionSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  title: z.string().min(1),
  blurb: z.string().optional(),
  categorySlug: z.string().optional(),
  productIds: z.array(z.string()).default([]),
  featuredImage: z.string().optional(),
  isLive: z.boolean().default(true),
  order: z.number().int().default(0),
});
export type Collection = z.infer<typeof collectionSchema>;

