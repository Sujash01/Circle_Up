import type { CreateInquiryPayload, Inquiry } from '@circleup/shared';
import { ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseAdminClient } from './supabase.service.js';

interface SupabaseInquiryRow {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: Inquiry['status'];
  created_at: string;
  updated_at: string;
}

export const inquiryService = {
  async create(input: CreateInquiryPayload): Promise<Inquiry> {
    const { data, error } = await getSupabaseAdminClient()
      .rpc('submit_contact_inquiry', {
        p_name: input.name, p_email: input.email, p_subject: input.subject, p_message: input.message,
      });

    if (error || !data) {
      throw new ServiceUnavailableError(
        'Contact submissions are temporarily unavailable. Please try again later.',
        'INQUIRY_STORAGE_UNAVAILABLE',
      );
    }

    const row = data as SupabaseInquiryRow;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },
};
