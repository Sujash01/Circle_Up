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
  announcementCouponCode: z.string().default(''),
  announcementStartsAt: z.string().nullable().optional(),
  announcementEndsAt: z.string().nullable().optional(),
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
  contactPhone: z.string().default(''),
  whatsappNumber: z.string().default(''),
  isWhatsappVerified: z.boolean().default(false),
  contentVersion: z.number().int().default(1),
  updatedAt: z.string().optional(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export function normalizeBusinessWhatsappNumber(value: string | undefined): string {
  if (!value || !/^\+?[\d ()-]+$/.test(value.trim())) return '';
  const digits = value.replace(/\D/g, '');
  const placeholders = ['919876543210', '910000000000', '1234567890', '9876543210'];
  return /^[1-9]\d{9,14}$/.test(digits) && !placeholders.includes(digits) ? digits : '';
}

export const storefrontLinkSchema = z.string().regex(/^\/(?![/\\])[^\s\\]*$/);

export const storefrontSettingsSchema = z.object({
  header: z.object({
    text: z.string(),
    link: storefrontLinkSchema,
    code: z.string().optional(),
    ctaLabel: z.string().optional(),
    isActive: z.boolean(),
  }).strict(),
  exitOffer: z.object({
    code: z.string(),
    headline: z.string(),
    subtext: z.string(),
    badgeText: z.string(),
    targetPages: z.array(z.string()),
    cooldownHours: z.number().nonnegative(),
  }).strict().nullable(),
  automaticCodes: z.array(z.string()),
  whatsappNumber: z.string().refine((value) => normalizeBusinessWhatsappNumber(value) === value),
}).strict();
export type StorefrontSettings = z.infer<typeof storefrontSettingsSchema>;

export const siteSettingsUpdateSchema = z.object({
  announcementText: z.string().optional(),
  announcementLink: z.union([storefrontLinkSchema, z.literal('')]).optional(),
  isAnnouncementActive: z.boolean().optional(),
  announcementCouponCode: z.string().trim().max(64).optional(),
  announcementStartsAt: z.string().nullable().optional(),
  announcementEndsAt: z.string().nullable().optional(),
  marqueePhrases: z.array(z.string()).optional(),
  categoryTiles: z.array(categoryTileSchema).optional(),
  customDrop: customDropOptionSchema.partial().strict().optional(),
  storeAddress: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  whatsappNumber: z.string().trim().max(32).refine(
    (value) => !value || Boolean(normalizeBusinessWhatsappNumber(value)),
    'Enter a valid business WhatsApp number.',
  ).optional(),
  isWhatsappVerified: z.boolean().optional(),
  // Returned by GET /settings and sent back by the existing admin form; these are read-only.
  contentVersion: z.number().int().optional(),
  updatedAt: z.string().optional(),
}).strict().refine(
  (settings) => settings.isWhatsappVerified !== true || Boolean(normalizeBusinessWhatsappNumber(settings.whatsappNumber)),
  { path: ['whatsappNumber'], message: 'Enter a valid business WhatsApp number before marking it verified.' },
);

export type SiteSettingsUpdate = z.infer<typeof siteSettingsUpdateSchema>;

export const announcementUpdateSchema = z.object({
  announcementText: z.string().trim().max(240),
  announcementLink: z.union([storefrontLinkSchema, z.literal('')]).default('/new-arrivals'),
  isAnnouncementActive: z.boolean(),
  announcementCouponCode: z.string().trim().max(64).optional().default(''),
  announcementStartsAt: z.string().nullable().optional(),
  announcementEndsAt: z.string().nullable().optional(),
}).strict().refine(
  (d) => !d.announcementStartsAt || !d.announcementEndsAt || new Date(d.announcementEndsAt) > new Date(d.announcementStartsAt),
  { path: ['announcementEndsAt'], message: 'Announcement end date must be after start date.' },
);
export type AnnouncementUpdate = z.infer<typeof announcementUpdateSchema>;

