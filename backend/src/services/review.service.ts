import { z } from 'zod';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';
import { ServiceUnavailableError } from '../errors/AppError.js';

export const reviewSubmissionSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(80),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().min(3, 'Review title must be at least 3 characters').max(150),
  comment: z.string().trim().min(10, 'Review comment must be at least 10 characters').max(2000),
  productSlug: z.string().trim().max(120).optional(),
  productName: z.string().trim().max(150).optional(),
}).strict();

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

type ReviewRow = {
  id: string;
  display_name: string;
  rating: number;
  title: string;
  comment: string;
  product_slug: string | null;
  product_name: string | null;
  status: string;
  created_at: string;
};

function mapReview(row: ReviewRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    rating: row.rating,
    title: row.title,
    comment: row.comment,
    productSlug: row.product_slug || undefined,
    productName: row.product_name || undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

// In-memory fallback records (used strictly in offline test environments when Supabase is unconfigured)
const mockReviews: ReviewRow[] = [];

export const reviewService = {
  async listApprovedReviews() {
    if (isSupabaseConfigured()) {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from('reviews')
        .select('*')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false });

      if (error) {
        throw new ServiceUnavailableError(`Failed to fetch customer reviews: ${error.message}`, 'DATABASE_UNAVAILABLE');
      }
      return (data || []).map((row) => mapReview(row as ReviewRow));
    }

    return mockReviews.filter((r) => r.status === 'APPROVED').map(mapReview);
  },

  async submitReview(input: ReviewSubmissionInput) {
    const parsed = reviewSubmissionSchema.parse(input);

    if (isSupabaseConfigured()) {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from('reviews')
        .insert({
          display_name: parsed.displayName,
          rating: parsed.rating,
          title: parsed.title,
          comment: parsed.comment,
          product_slug: parsed.productSlug || null,
          product_name: parsed.productName || null,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) {
        throw new ServiceUnavailableError(`Failed to submit review: ${error.message}`, 'DATABASE_UNAVAILABLE');
      }
      return mapReview(data as ReviewRow);
    }

    // Offline mock fallback
    const mockRecord: ReviewRow = {
      id: `rev-${Date.now().toString(36)}`,
      display_name: parsed.displayName,
      rating: parsed.rating,
      title: parsed.title,
      comment: parsed.comment,
      product_slug: parsed.productSlug || null,
      product_name: parsed.productName || null,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    mockReviews.unshift(mockRecord);
    return mapReview(mockRecord);
  },

  _clearMockReviews() {
    mockReviews.length = 0;
  },
};
