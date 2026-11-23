import { z } from 'zod';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase.service.js';
import { ServiceUnavailableError } from '../errors/AppError.js';

export const communityPostSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(80),
  handle: z.string().trim().min(2).max(80),
  caption: z.string().trim().min(5, 'Caption must be at least 5 characters').max(1000),
  image: z.string().min(10, 'Photo is required'),
  taggedPiece: z.string().trim().max(150).optional(),
}).strict();

export type CommunityPostInput = z.infer<typeof communityPostSchema>;

type CommunityPostRow = {
  id: string;
  display_name: string;
  handle: string;
  caption: string;
  image_url: string;
  tagged_piece: string | null;
  status: string;
  created_at: string;
};

function mapPost(row: CommunityPostRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    handle: row.handle.startsWith('@') ? row.handle : `@${row.handle}`,
    caption: row.caption,
    image: row.image_url,
    taggedPiece: row.tagged_piece || undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

const mockCommunityPosts: CommunityPostRow[] = [];

export const communityService = {
  async listApprovedPosts() {
    if (isSupabaseConfigured()) {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from('community_posts')
        .select('*')
        .eq('status', 'APPROVED')
        .order('created_at', { ascending: false });

      if (error) {
        throw new ServiceUnavailableError(`Failed to fetch community posts: ${error.message}`, 'DATABASE_UNAVAILABLE');
      }
      return (data || []).map((row) => mapPost(row as CommunityPostRow));
    }

    return mockCommunityPosts.filter((p) => p.status === 'APPROVED').map(mapPost);
  },

  async submitPost(input: CommunityPostInput) {
    const parsed = communityPostSchema.parse(input);
    const normalizedHandle = parsed.handle.startsWith('@') ? parsed.handle : `@${parsed.handle}`;

    if (isSupabaseConfigured()) {
      const client = getSupabaseAdminClient();
      const { data, error } = await client
        .from('community_posts')
        .insert({
          display_name: parsed.displayName,
          handle: normalizedHandle,
          caption: parsed.caption,
          image_url: parsed.image,
          tagged_piece: parsed.taggedPiece || null,
          status: 'PENDING',
        })
        .select()
        .single();

      if (error) {
        throw new ServiceUnavailableError(`Failed to submit community post: ${error.message}`, 'DATABASE_UNAVAILABLE');
      }
      return mapPost(data as CommunityPostRow);
    }

    const mockRecord: CommunityPostRow = {
      id: `crew-${Date.now().toString(36)}`,
      display_name: parsed.displayName,
      handle: normalizedHandle,
      caption: parsed.caption,
      image_url: parsed.image,
      tagged_piece: parsed.taggedPiece || null,
      status: 'PENDING',
      created_at: new Date().toISOString(),
    };
    mockCommunityPosts.unshift(mockRecord);
    return mapPost(mockRecord);
  },

  _clearMockPosts() {
    mockCommunityPosts.length = 0;
  },
};
