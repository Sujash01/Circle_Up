import {
  siteSettingsSchema,
  normalizeBusinessWhatsappNumber,
  type SiteSettings,
  type SiteSettingsUpdate,
} from '@circleup/shared';
import { ConflictError, ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseAdminClient } from '../services/supabase.service.js';

const DEFAULT_SETTINGS = siteSettingsSchema.parse({});

function toDatabaseRow(settings: SiteSettingsUpdate | SiteSettings): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const columnByField: Record<string, string> = {
    announcementText: 'announcement_text',
    announcementLink: 'announcement_link',
    isAnnouncementActive: 'is_announcement_active',
    announcementCouponCode: 'announcement_coupon_code',
    announcementStartsAt: 'announcement_starts_at',
    announcementEndsAt: 'announcement_ends_at',
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
    announcementCouponCode: row.announcement_coupon_code ?? undefined,
    announcementStartsAt: row.announcement_starts_at ?? undefined,
    announcementEndsAt: row.announcement_ends_at ?? undefined,
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

export const getConfiguredWhatsappNumber = normalizeBusinessWhatsappNumber;

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
    const update = toDatabaseRow(settings);
    let version = settings.contentVersion;
    if (settings.customDrop !== undefined) {
      const { data, error } = await client.from('site_settings')
        .select('curated_drop,content_version').eq('id', 'default').maybeSingle();
      if (error || !data || typeof data.content_version !== 'number') throw unavailable();
      update.curated_drop = { ...data.curated_drop, ...settings.customDrop };
      version ??= data.content_version;
    }
    if (settings.whatsappNumber !== undefined && settings.isWhatsappVerified === undefined) {
      update.is_whatsapp_verified = false;
    }
    if (Object.keys(update).length === 0) return this.getSettings();
    let request = client.from('site_settings').update(update).eq('id', 'default');
    if (version !== undefined) request = request.eq('content_version', version);
    const { data, error } = await request.select('*').maybeSingle();
    if (error) throw unavailable();
    if (!data && version !== undefined) {
      throw new ConflictError('Site settings changed. Refresh before saving your edits.', 'SETTINGS_VERSION_CONFLICT');
    }
    if (!data) throw unavailable();
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
