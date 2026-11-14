import { z } from 'zod';

export const siteSettingsSchema = z.object({
  announcementText: z.string().default(
    'Use code THRIFT10 or CIRCLE20 in bag • Plastic-free sustainable packaging on every parcel',
  ),
  marqueePhrases: z.array(z.string()).default([
    'Thrifted with care',
    'Rentals for every occasion',
    'Handcrafted pieces',
    'Plastic-free packaging',
    'Community sale days',
    'Fashion that lasts',
  ]),
  storeAddress: z.string().default('CircleUp Studio Courtyard, Sector 7, Chandigarh'),
  contactEmail: z.string().email().default('care@circleuponline.com'),
  contactPhone: z.string().default('+91 98765 43210'),
  whatsappNumber: z.string().default('+919876543210'),
  contentVersion: z.number().int().default(1),
  updatedAt: z.string().optional(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

