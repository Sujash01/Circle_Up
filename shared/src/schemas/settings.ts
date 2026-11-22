import { z } from 'zod';

export const categoryTileSchema = z.object({
  to: z.string(),
  title: z.string(),
  note: z.string(),
  img: z.string(),
  alt: z.string(),
});
export type CategoryTile = z.infer<typeof categoryTileSchema>;

export const customDropOptionSchema = z.object({
  label: z.string().default('Curated Drop'),
  to: z.string().default('/thrifted-treasure'),
  badge: z.string().default('Featured Drop'),
  description: z.string().default('Special seasonal curation from our archive'),
  enabled: z.boolean().default(true),
});
export type CustomDropOption = z.infer<typeof customDropOptionSchema>;

export const siteSettingsSchema = z.object({
  announcementText: z.string().default(
    'Plastic-free sustainable packaging on every parcel',
  ),
  announcementLink: z.string().default('/new-arrivals'),
  isAnnouncementActive: z.boolean().default(true),
  marqueePhrases: z.array(z.string()).default([
    'Thrifted with care',
    'Rentals for every occasion',
    'Handcrafted pieces',
    'Plastic-free packaging',
    'Community sale days',
    'Fashion that lasts',
  ]),
  categoryTiles: z.array(categoryTileSchema).optional(),
  customDrop: customDropOptionSchema.default(() => customDropOptionSchema.parse({})),
  storeAddress: z.string().default('CircleUp Studio Courtyard, Sector 7, Chandigarh'),
  contactEmail: z.string().email().default('care@circleuponline.com'),
  contactPhone: z.string().default('+91 98765 43210'),
  whatsappNumber: z.string().default(''),
  isWhatsappVerified: z.boolean().default(false),
  contentVersion: z.number().int().default(1),
  updatedAt: z.string().optional(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export const siteSettingsUpdateSchema = z.object({
  announcementText: z.string().optional(),
  announcementLink: z.string().optional(),
  isAnnouncementActive: z.boolean().optional(),
  marqueePhrases: z.array(z.string()).optional(),
  categoryTiles: z.array(categoryTileSchema).optional(),
  customDrop: customDropOptionSchema.optional(),
  storeAddress: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  isWhatsappVerified: z.boolean().optional(),
  // Returned by GET /settings and sent back by the existing admin form; these are read-only.
  contentVersion: z.number().int().optional(),
  updatedAt: z.string().optional(),
}).strict();

export type SiteSettingsUpdate = z.infer<typeof siteSettingsUpdateSchema>;

