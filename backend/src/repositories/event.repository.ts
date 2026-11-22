import { getSupabaseServiceClient } from '../services/supabase.service.js';
import { ServiceUnavailableError, NotFoundError, ConflictError } from '../errors/AppError.js';

export interface EventRecord {
  id?: string;
  title: string;
  slug?: string;
  date: string;
  location: string;
  description: string;
  image?: string;
  type: 'POP_UP' | 'COMMUNITY' | 'OFFLINE_SALE';
  capacity?: number | null;
  registeredCount: number;
  isRegistrationOpen: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const slugify = (value: string) => value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toTimestamp(label: string): string {
  const match = label.match(/(?:^|,\s*)([A-Za-z]+\s+\d{1,2},\s+\d{4})(?:\s*[·•-]\s*(\d{1,2}:\d{2}\s*[AP]M))?/i);
  if (!match) return '';
  const dateTime = `${match[1]} ${match[2] || '12:00 AM'}`;
  const parsed = new Date(`${dateTime} GMT+0530`);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString();
}

export function mapEvent(row: Record<string, unknown>): EventRecord {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    title: String(row.title || ''), slug: typeof row.slug === 'string' ? row.slug : undefined,
    date: String(row.date_label || row.date || ''),
    location: String(row.location || ''), description: String(row.description || ''), image: String(row.image_url || ''),
    type: row.type as EventRecord['type'], capacity: typeof row.capacity === 'number' ? row.capacity : undefined,
    registeredCount: typeof row.registered_count === 'number' ? row.registered_count : 0,
    isRegistrationOpen: typeof row.is_registration_open === 'boolean' ? row.is_registration_open : true,
    createdAt: typeof row.created_at === 'string' ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

export function toEventRow(input: Partial<EventRecord>) {
  const dateLabel = input.date;
  let date: string | undefined;
  if (dateLabel) date = toTimestamp(dateLabel);
  return {
    ...(input.title !== undefined ? { title: input.title.trim(), slug: slugify(input.title) } : {}),
    ...(dateLabel !== undefined ? { date: date || null, date_label: dateLabel } : {}),
    ...(input.location !== undefined ? { location: input.location.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.image !== undefined ? { image_url: input.image } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    ...(input.registeredCount !== undefined ? { registered_count: input.registeredCount } : {}),
    ...(input.isRegistrationOpen !== undefined ? { is_registration_open: input.isRegistrationOpen } : {}),
    updated_at: new Date().toISOString(),
  };
}

function fail(error: unknown): never {
  throw new ServiceUnavailableError(error instanceof Error ? error.message : 'Events database is unavailable.', 'DATABASE_UNAVAILABLE');
}

export const eventRepository = {
  async list(publicOnly = false): Promise<EventRecord[]> {
    try {
      let query = getSupabaseServiceClient().from('events').select('*').order('date', { ascending: true });
      if (publicOnly) query = query.eq('is_registration_open', true);
      const { data, error } = await query;
      if (error) fail(error);
      return (data || []).map((row) => mapEvent(row as Record<string, unknown>));
    } catch (error) { fail(error); }
  },
  async get(id: string, publicOnly = true): Promise<EventRecord> {
    try {
      let query = getSupabaseServiceClient().from('events').select('*').eq('id', id);
      if (publicOnly) query = query.eq('is_registration_open', true);
      const { data, error } = await query.maybeSingle();
      if (error) fail(error);
      if (!data) throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
      return mapEvent(data);
    } catch (error) { if (error instanceof NotFoundError) throw error; fail(error); }
  },
  async create(input: Partial<EventRecord>): Promise<EventRecord> {
    try {
      const row = toEventRow(input);
      const { data, error } = await getSupabaseServiceClient().from('events').insert(row).select('*').single();
      if (error) fail(error);
      return mapEvent(data);
    } catch (error) { fail(error); }
  },
  async update(id: string, input: Partial<EventRecord>): Promise<EventRecord> {
    try {
      const { data, error } = await getSupabaseServiceClient().from('events').update(toEventRow(input)).eq('id', id).select('*').maybeSingle();
      if (error) fail(error);
      if (!data) throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
      return mapEvent(data);
    } catch (error) { if (error instanceof NotFoundError) throw error; fail(error); }
  },
  async delete(id: string): Promise<void> {
    try {
      const { data, error } = await getSupabaseServiceClient().from('events').delete().eq('id', id).select('id').maybeSingle();
      if (error) fail(error);
      if (!data) throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    } catch (error) { if (error instanceof NotFoundError) throw error; fail(error); }
  },
  async register(eventId: string, input: { name: string; email: string; phone: string; notes?: string }) {
    try {
      const client = getSupabaseServiceClient();
      const { data: event, error: eventError } = await client.from('events').select('id,title,is_registration_open').eq('id', eventId).maybeSingle();
      if (eventError) fail(eventError);
      if (!event) throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
      if (!event.is_registration_open) throw new ConflictError('Registration for this event is closed.', 'EVENT_REGISTRATION_CLOSED');
      const normalizedEmail = input.email.trim().toLowerCase();
      const { data: existing, error: duplicateError } = await client.from('event_registrations').select('id').eq('event_id', eventId).eq('email', normalizedEmail).limit(1);
      if (duplicateError) fail(duplicateError);
      if (existing?.length) throw new ConflictError('A registration for this email has already been received for this event.', 'DUPLICATE_REGISTRATION');
      const { data, error } = await client.from('event_registrations').insert({ event_id: eventId, name: input.name.trim(), email: normalizedEmail, phone: input.phone.trim(), notes: input.notes?.trim() || '' }).select('*').single();
      if (error) fail(error);
      return { id: data.id, eventId: data.event_id, eventTitle: event.title, name: data.name, email: data.email, phone: data.phone, notes: data.notes || undefined, createdAt: data.created_at };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ConflictError) throw error;
      fail(error);
    }
  },
  async seedIfMissing(input: EventRecord): Promise<void> {
    try {
      const row = toEventRow(input);
      const { error } = await getSupabaseServiceClient().from('events').upsert({ ...row, slug: slugify(input.title) }, { onConflict: 'slug', ignoreDuplicates: true });
      if (error) fail(error);
    } catch (error) { fail(error); }
  },
};
