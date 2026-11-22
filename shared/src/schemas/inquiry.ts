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
});

export type CreateInquiryPayload = z.infer<typeof createInquiryPayloadSchema>;

export const inquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  subject: z.string(),
  message: z.string(),
  status: z.enum(['NEW', 'IN_REVIEW', 'RESOLVED', 'ARCHIVED']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Inquiry = z.infer<typeof inquirySchema>;
