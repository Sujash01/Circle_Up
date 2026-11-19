import mongoose from 'mongoose';
import { SiteSettings, type ISiteSettingsDocument } from '../models/SiteSettings.js';

const DEFAULT_SETTINGS = {
  announcementText:
    'Use code THRIFT10 or CIRCLE20 in bag • Plastic-free sustainable packaging on every parcel',
  marqueePhrases: [
    'Thrifted with care',
    'Rentals for every occasion',
    'Handcrafted pieces',
    'Plastic-free packaging',
    'Community sale days',
    'Fashion that lasts',
  ],
  storeAddress: 'CircleUp Studio Courtyard, Sector 7, Chandigarh',
  contactEmail: 'care@circleuponline.com',
  contactPhone: '+91 98765 43210',
  whatsappNumber: '',
  contentVersion: 1,
};

export function getConfiguredWhatsappNumber(value: string | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  // These numbers have appeared as repository defaults/placeholders; never expose them as payment contacts.
  if (!/^[1-9]\d{9,14}$/.test(digits) || ['919876543210', '910000000000'].includes(digits)) return '';
  return digits;
}

export const settingsRepository = {
  async getSettings(): Promise<ISiteSettingsDocument> {
    if (mongoose.connection.readyState !== 1) {
      return DEFAULT_SETTINGS as unknown as ISiteSettingsDocument;
    }

    const settings = await SiteSettings.findOne().lean();
    if (!settings) {
      const created = await SiteSettings.create(DEFAULT_SETTINGS);
      return created.toJSON() as unknown as ISiteSettingsDocument;
    }
    return settings as unknown as ISiteSettingsDocument;
  },

  async bumpVersion(): Promise<number> {
    if (mongoose.connection.readyState !== 1) return 1;
    const doc = await SiteSettings.findOneAndUpdate(
      {},
      { $inc: { contentVersion: 1 } },
      { new: true, upsert: true },
    );
    return doc.contentVersion;
  },
};
