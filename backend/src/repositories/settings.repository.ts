import {
  siteSettingsSchema,
  type SiteSettings,
  type SiteSettingsUpdate,
} from '@circleup/shared';
import { ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseAdminClient } from '../services/supabase.service.js';

const DEFAULT_SETTINGS = siteSettingsSchema.parse({});

function toDatabaseRow(settings: SiteSettingsUpdate | SiteSettings): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const columnByField: Record<string, string> = {
    announcementText: 'announcement_text',
    announcementLink: 'announcement_link',
    isAnnouncementActive: 'is_announcement_active',
    marqueePhrases: 'marquee_phrases',
    categoryTiles: 'category_tiles',
    customDrop: 'curated_drop',
    storeAddress: 'store_address',
    contactEmail: 'contact_email',
    contactPhone: 'contact_phone',
    whatsappNumber: 'whatsapp_number',
    isWhatsappVerified: 'is_whatsapp_verified',
  };

  for (const [field, column] of Object.entries(columnByField)) {
    if (field in settings) row[column] = settings[field as keyof typeof settings];
  }
  return row;
}

function fromDatabaseRow(row: Record<string, unknown>): SiteSettings {
  return siteSettingsSchema.parse({
    announcementText: row.announcement_text ?? undefined,
    announcementLink: row.announcement_link ?? undefined,
    isAnnouncementActive: row.is_announcement_active ?? undefined,
    marqueePhrases: row.marquee_phrases ?? undefined,
    categoryTiles: row.category_tiles ?? undefined,
    customDrop: row.curated_drop ?? undefined,
    storeAddress: row.store_address ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    whatsappNumber: row.whatsapp_number ?? undefined,
    isWhatsappVerified: row.is_whatsapp_verified ?? undefined,
    contentVersion: row.content_version ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  });
}

function unavailable(): ServiceUnavailableError {
  return new ServiceUnavailableError(
    'Site settings are temporarily unavailable. Please try again later.',
    'SETTINGS_STORAGE_UNAVAILABLE',
  );
}

export function getConfiguredWhatsappNumber(value: string | undefined): string {
  const digits = (value || '').replace(/\D/g, '');
  // These numbers have appeared as repository defaults/placeholders; never expose them as payment contacts.
  if (!/^[1-9]\d{9,14}$/.test(digits) || ['919876543210', '910000000000'].includes(digits)) return '';
  return digits;
}

export const settingsRepository = {
  async getSettings(): Promise<SiteSettings> {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from('site_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error) throw unavailable();
    if (data) return fromDatabaseRow(data as Record<string, unknown>);

    // Match the previous repository's initialize-on-first-read behavior, but persist defaults in PostgreSQL.
    const { data: created, error: insertError } = await client
      .from('site_settings')
      .insert({ id: 'default', ...toDatabaseRow(DEFAULT_SETTINGS) })
      .select('*')
      .single();
    if (insertError || !created) throw unavailable();
    return fromDatabaseRow(created as Record<string, unknown>);
  },

  async updateSettings(settings: SiteSettingsUpdate): Promise<SiteSettings> {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from('site_settings')
      .upsert({ id: 'default', ...toDatabaseRow(settings) })
      .select('*')
      .single();

    if (error || !data) throw unavailable();
    return fromDatabaseRow(data as Record<string, unknown>);
  },

  async upsertSettings(settings: SiteSettingsUpdate): Promise<SiteSettings> {
    return this.updateSettings(settings);
  },

  async bumpVersion(): Promise<number> {
    const client = getSupabaseAdminClient();
    const { data, error } = await client
      .from('site_settings')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', 'default')
      .select('content_version')
      .single();

    if (error || !data || typeof data.content_version !== 'number') throw unavailable();
    return data.content_version;
  },
};
