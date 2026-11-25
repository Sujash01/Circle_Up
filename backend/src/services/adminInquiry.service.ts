import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';
import { NotFoundError, ServiceUnavailableError } from '../errors/AppError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { emailService } from './email.service.js';

import { inquiryStatusSchema, type AdminInquiry, type AdminInquiryUpdate } from '@circleup/shared';

function mapInquiry(row: Record<string, unknown>): AdminInquiry {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    email: String(row.email || ''),
    phone: row.phone ? String(row.phone) : null,
    category: String(row.category || 'general'),
    subject: String(row.subject || ''),
    message: String(row.message || ''),
    status: inquiryStatusSchema.parse(row.status),
    notes: row.notes ? String(row.notes) : null,
    reply: row.reply ? String(row.reply) : null,
    repliedAt: row.replied_at ? String(row.replied_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export const adminInquiryService = {
  async listInquiries(query: { page?: unknown; limit?: unknown; status?: string; search?: string }) {
    if (!isSupabaseConfigured()) throw new ServiceUnavailableError('Supabase storage is not configured.', 'DATABASE_UNAVAILABLE');
    const { page, limit, skip } = parsePagination(query);
    const client = getSupabaseAdminClient();
    let req = client.from('inquiries').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id');

    if (query.status && query.status.toUpperCase() !== 'ALL') {
      req = req.eq('status', query.status.toUpperCase());
    }
    const search = query.search?.trim().replace(/["\\%_*]/g, '');
    if (search) {
      const pattern = `"%${search}%"`;
      req = req.or(['name', 'email', 'phone', 'subject', 'message'].map((field) => `${field}.ilike.${pattern}`).join(','));
    }

    const { data, error, count } = await req.range(skip, skip + limit - 1);
    if (error) throw new ServiceUnavailableError('Failed to fetch inquiries.', 'DATABASE_UNAVAILABLE');

    const items = (data || []).map(mapInquiry);
    const total = typeof count === 'number' ? count : items.length;
    return { inquiries: items, meta: buildPaginationMeta(page, limit, total) };
  },

  async getInquiry(id: string) {
    if (!isSupabaseConfigured()) throw new ServiceUnavailableError('Supabase storage is not configured.', 'DATABASE_UNAVAILABLE');
    const { data, error } = await getSupabaseAdminClient().from('inquiries').select('*').eq('id', id).maybeSingle();
    if (error) throw new ServiceUnavailableError('Failed to fetch inquiry.', 'DATABASE_UNAVAILABLE');
    if (!data) throw new NotFoundError('Inquiry not found.', 'INQUIRY_NOT_FOUND');
    return mapInquiry(data);
  },

  async updateInquiry(id: string, patch: AdminInquiryUpdate) {
    if (!isSupabaseConfigured()) throw new ServiceUnavailableError('Supabase storage is not configured.', 'DATABASE_UNAVAILABLE');
    const existing = await this.getInquiry(id);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status) updatePayload.status = patch.status;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;
    if (patch.reply && patch.reply !== existing.reply) {
      const sent = await emailService.sendInquiryReply(existing.email, existing.name, existing.subject, patch.reply);
      if (!sent) throw new ServiceUnavailableError('Email delivery is unavailable. Please try again.', 'INQUIRY_REPLY_UNAVAILABLE');
      updatePayload.reply = patch.reply;
      updatePayload.replied_at = new Date().toISOString();
      updatePayload.status = 'RESOLVED';
    }

    const { data, error } = await getSupabaseAdminClient()
      .from('inquiries')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new ServiceUnavailableError('Failed to update inquiry.', 'DATABASE_UNAVAILABLE');

    return mapInquiry(data);
  },
};
