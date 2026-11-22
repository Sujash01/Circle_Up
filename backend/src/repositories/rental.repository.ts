import type { RentalCatalogItem } from '@circleup/shared';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseServiceClient } from '../services/supabase.service.js';

export interface RentalRecord extends RentalCatalogItem {
  createdAt?: string;
  updatedAt?: string;
}

export function mapRental(row: Record<string, unknown>): RentalRecord {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    slug: String(row.slug || ''),
    category: String(row.category || 'rentals'),
    image: String(row.image_url || ''),
    rentalPrice3Days: Number(row.rental_price_3_days_paise || 0),
    rentalPrice7Days: Number(row.rental_price_7_days_paise || 0),
    rentalPrice14Days: Number(row.rental_price_14_days_paise || 0),
    securityDeposit: Number(row.security_deposit_paise || 0),
    condition: String(row.condition || 'Mint'),
    size: String(row.size || 'One Size'),
    isAvailable: Boolean(row.is_available),
    description: String(row.description || ''),
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

function toRow(input: Partial<RentalCatalogItem>) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.slug !== undefined ? { slug: input.slug.trim().toLowerCase() } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.image !== undefined ? { image_url: input.image } : {}),
    ...(input.rentalPrice3Days !== undefined ? { rental_price_3_days_paise: input.rentalPrice3Days } : {}),
    ...(input.rentalPrice7Days !== undefined ? { rental_price_7_days_paise: input.rentalPrice7Days } : {}),
    ...(input.rentalPrice14Days !== undefined ? { rental_price_14_days_paise: input.rentalPrice14Days } : {}),
    ...(input.securityDeposit !== undefined ? { security_deposit_paise: input.securityDeposit } : {}),
    ...(input.condition !== undefined ? { condition: input.condition } : {}),
    ...(input.size !== undefined ? { size: input.size } : {}),
    ...(input.isAvailable !== undefined ? { is_available: input.isAvailable } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    updated_at: new Date().toISOString(),
  };
}

function databaseFailure(error: unknown): never {
  if (error instanceof ConflictError || error instanceof NotFoundError || error instanceof ServiceUnavailableError) throw error;
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') throw new ConflictError('A rental with this slug already exists.', 'RENTAL_SLUG_EXISTS');
  throw new ServiceUnavailableError('Rental catalogue database is unavailable.', 'DATABASE_UNAVAILABLE');
}

export const rentalRepository = {
  async list(publicOnly = false): Promise<RentalRecord[]> {
    try {
      let query = getSupabaseServiceClient().from('rental_catalog_items').select('*').order('created_at', { ascending: false });
      if (publicOnly) query = query.eq('is_available', true);
      const { data, error } = await query;
      if (error) databaseFailure(error);
      return (data || []).map((row) => mapRental(row as Record<string, unknown>));
    } catch (error) { databaseFailure(error); }
  },
  async get(identifier: string): Promise<RentalRecord> {
    try {
      const client = getSupabaseServiceClient();
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      const { data, error } = await client.from('rental_catalog_items').select('*').eq(isId ? 'id' : 'slug', identifier).eq('is_available', true).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) throw new NotFoundError('Rental item not found.', 'RENTAL_NOT_FOUND');
      return mapRental(data as Record<string, unknown>);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      databaseFailure(error);
    }
  },
  async create(input: RentalCatalogItem): Promise<RentalRecord> {
    try {
      const { data, error } = await getSupabaseServiceClient().from('rental_catalog_items').insert(toRow(input)).select('*').single();
      if (error) databaseFailure(error);
      return mapRental(data as Record<string, unknown>);
    } catch (error) { databaseFailure(error); }
  },
  async update(id: string, input: RentalCatalogItem): Promise<RentalRecord> {
    try {
      const { data, error } = await getSupabaseServiceClient().from('rental_catalog_items').update(toRow(input)).eq('id', id).select('*').maybeSingle();
      if (error) databaseFailure(error);
      if (!data) throw new NotFoundError('Rental item not found.', 'RENTAL_NOT_FOUND');
      return mapRental(data as Record<string, unknown>);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      databaseFailure(error);
    }
  },
  async delete(id: string): Promise<void> {
    try {
      const { data, error } = await getSupabaseServiceClient().from('rental_catalog_items').delete().eq('id', id).select('id').maybeSingle();
      if (error) databaseFailure(error);
      if (!data) throw new NotFoundError('Rental item not found.', 'RENTAL_NOT_FOUND');
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      databaseFailure(error);
    }
  },
  async seedIfMissing(input: RentalCatalogItem): Promise<void> {
    try {
      const { error } = await getSupabaseServiceClient().from('rental_catalog_items').upsert(toRow(input), { onConflict: 'slug', ignoreDuplicates: true });
      if (error) databaseFailure(error);
    } catch (error) { databaseFailure(error); }
  },
};
