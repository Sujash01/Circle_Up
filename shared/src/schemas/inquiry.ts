import { z } from 'zod';

/** Public contact form payload, bounded to the columns in public.inquiries. */
export const createInquiryPayloadSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .transform((value) => value ?? 'General Inquiry'),
  message: z.string().trim().min(1).max(5000),
}).strict();

export type CreateInquiryPayload = z.infer<typeof createInquiryPayloadSchema>;

export const inquiryStatusSchema = z.enum(['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED']);

export const inquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  subject: z.string(),
  message: z.string(),
  status: inquiryStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Inquiry = z.infer<typeof inquirySchema>;

export const adminInquirySchema = inquirySchema.extend({
  phone: z.string().nullable(),
  category: z.string(),
  notes: z.string().nullable(),
  reply: z.string().nullable(),
  repliedAt: z.string().nullable(),
});
export type AdminInquiry = z.infer<typeof adminInquirySchema>;

export const adminInquiryUpdateSchema = z.object({
  status: inquiryStatusSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
  reply: z.string().trim().min(1).max(4000).optional(),
}).strict();
export type AdminInquiryUpdate = z.infer<typeof adminInquiryUpdateSchema>;
