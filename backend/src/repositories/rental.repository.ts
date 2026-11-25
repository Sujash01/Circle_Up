import { adminRentalBookingSchema, type RentalBookingStatus, type RentalCatalogItem } from '@circleup/shared';
import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseServiceClient } from '../services/supabase.service.js';

export interface RentalRecord extends RentalCatalogItem {
  createdAt?: string;
  updatedAt?: string;
  unavailableDates?: string[];
}

function mapBooking(row: Record<string, unknown>) {
  const catalog = row.rental_catalog_items as { name?: string } | null;
  const product = row.products as { name?: string } | null;
  return adminRentalBookingSchema.parse({
    id: row.id, rentalCatalogId: row.rental_catalog_id, productId: row.product_id,
    productName: row.product_name || catalog?.name || product?.name || null,
    customerName: row.customer_name, customerEmail: row.customer_email || null,
    customerPhone: row.customer_phone, size: row.size, startDate: row.start_date, endDate: row.end_date,
    durationDays: row.duration_days, rentalFeePaise: Number(row.rental_fee_paise),
    securityDepositPaise: Number(row.security_deposit_paise), totalPaise: Number(row.total_paise),
    status: row.status, notes: row.notes ?? null, createdAt: row.created_at,
  });
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
  if (error instanceof BadRequestError || error instanceof ConflictError || error instanceof NotFoundError || error instanceof ServiceUnavailableError) throw error;
  const code = (error as { code?: string } | null)?.code;
  if (code === '23505') throw new ConflictError('A rental with this slug already exists.', 'RENTAL_SLUG_EXISTS');
  if (code === '23503') throw new ConflictError('This item has booking history. Mark it unavailable to remove it from the storefront.', 'RENTAL_HAS_BOOKINGS');
  throw new ServiceUnavailableError('Rental catalogue database is unavailable.', 'DATABASE_UNAVAILABLE');
}

function bookingFailure(error: { code?: string }): never {
  if (error.code === 'P0002') throw new NotFoundError('Rental item or booking is unavailable.', 'RENTAL_NOT_FOUND');
  if (error.code === '23P01') throw new ConflictError('The rental is already booked for these dates.', 'RENTAL_DATES_UNAVAILABLE');
  if (error.code === '22023') throw new BadRequestError('Check the rental dates, size, or booking status.', 'INVALID_RENTAL_BOOKING');
  return databaseFailure(error);
}

async function withAvailability(records: RentalRecord[]): Promise<RentalRecord[]> {
  if (!records.length) return records;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabaseServiceClient().from('rental_bookings')
    .select('rental_catalog_id,start_date,end_date').in('status', ['CONFIRMED', 'ACTIVE'])
    .gte('end_date', today).lte('start_date', horizon);
  if (error) databaseFailure(error);
  const dates = new Map<string, Set<string>>();
  for (const row of data || []) {
    if (!row.rental_catalog_id) continue;
    const blocked = dates.get(row.rental_catalog_id) ?? new Set<string>();
    const start = Math.max(Date.parse(today), Date.parse(row.start_date));
    const end = Math.min(Date.parse(horizon), Date.parse(row.end_date));
    for (let day = start; day <= end; day += 86_400_000) {
      blocked.add(new Date(day).toISOString().slice(0, 10));
    }
    dates.set(row.rental_catalog_id, blocked);
  }
  return records.map((record) => ({ ...record, unavailableDates: [...(dates.get(record.id ?? '') ?? [])].sort() }));
}

export const rentalRepository = {
  async list(publicOnly = false): Promise<RentalRecord[]> {
    try {
      let query = getSupabaseServiceClient().from('rental_catalog_items').select('*').order('created_at', { ascending: false });
      if (publicOnly) query = query.eq('is_available', true);
      const { data, error } = await query;
      if (error) databaseFailure(error);
      const records = (data || []).map((row) => mapRental(row as Record<string, unknown>));
      return publicOnly ? await withAvailability(records) : records;
    } catch (error) { databaseFailure(error); }
  },
  async get(identifier: string): Promise<RentalRecord> {
    try {
      const client = getSupabaseServiceClient();
      const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      const { data, error } = await client.from('rental_catalog_items').select('*').eq(isId ? 'id' : 'slug', identifier).eq('is_available', true).maybeSingle();
      if (error) databaseFailure(error);
      if (!data) throw new NotFoundError('Rental item not found.', 'RENTAL_NOT_FOUND');
      const [record] = await withAvailability([mapRental(data)]);
      return record!;
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

  async listBookings(page: number, limit: number) {
    const start = (page - 1) * limit;
    const { data, error, count } = await getSupabaseServiceClient().from('rental_bookings')
      .select('*,rental_catalog_items(name),products(name)', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id').range(start, start + limit - 1);
    if (error) bookingFailure(error);
    return { bookings: (data || []).map(mapBooking), total: count ?? 0 };
  },

  async updateBooking(id: string, status: RentalBookingStatus) {
    const { data, error } = await getSupabaseServiceClient().rpc('admin_update_rental_booking', {
      p_id: id, p_status: status,
    });
    if (error) bookingFailure(error);
    return mapBooking(data);
  },

  async submitBooking(input: {
    catalogId: string; customerName: string; customerEmail?: string; customerPhone: string;
    size: string; startDate: string; endDate: string; notes?: string;
  }) {
    const { data, error } = await getSupabaseServiceClient().rpc('submit_rental_booking', {
      p_catalog_id: input.catalogId, p_name: input.customerName, p_email: input.customerEmail ?? null,
      p_phone: input.customerPhone, p_size: input.size, p_start: input.startDate, p_end: input.endDate,
      p_notes: input.notes ?? null,
    });
    if (error) bookingFailure(error);
    return mapBooking(data);
  },
};
