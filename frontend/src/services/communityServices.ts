import { SAMPLE_COMMUNITY_POSTS } from '@/data/community';
import { storefrontApi } from './storefrontApi';
import { SAMPLE_REVIEWS } from '@/data/reviews';
import type {
  CommunitySubmission,
  EventItem,
  EventRegistration,
  ReviewItem,
} from '@/types/storefront';
import { readStorage, writeStorage } from './storage';

const REVIEWS_KEY = 'circleup_local_reviews_v1';
const EVENT_REGS_KEY = 'circleup_event_regs_v1';
const COMMUNITY_KEY = 'circleup_community_posts_v1';

export const reviewService = {
  getAllReviews(): ReviewItem[] {
    const local = readStorage<ReviewItem[]>(REVIEWS_KEY, []);
    const safeLocal = Array.isArray(local) ? local : [];
    return [...safeLocal, ...SAMPLE_REVIEWS];
  },

  submitReview(input: {
    displayName: string;
    rating: number;
    title: string;
    comment: string;
    productSlug?: string;
    productName?: string;
  }): ReviewItem {
    const next: ReviewItem = {
      id: `rev-local-${Date.now().toString(36)}`,
      displayName: input.displayName.trim(),
      rating: input.rating,
      title: input.title.trim(),
      comment: input.comment.trim(),
      productSlug: input.productSlug || undefined,
      productName: input.productName || undefined,
      createdAt: new Date().toISOString(),
      isLocalSubmission: true,
    };

    const existing = readStorage<ReviewItem[]>(REVIEWS_KEY, []);
    writeStorage(REVIEWS_KEY, [next, ...(Array.isArray(existing) ? existing : [])]);
    return next;
  },
};
export const eventService = {
  async getAllEvents(): Promise<EventItem[]> {
    return storefrontApi.getEvents();
  },

  async getEventById(id: string): Promise<EventItem> {
    return storefrontApi.getEvent(id);
  },

  getRegistrations(): EventRegistration[] {
    const data = readStorage<EventRegistration[]>(EVENT_REGS_KEY, []);
    return Array.isArray(data) ? data : [];
  },

  async registerForEvent(input: {
    event: EventItem;
    name: string;
    email: string;
    phone: string;
    notes?: string;
  }): Promise<{ registration?: EventRegistration; error?: string }> {
    const existing = this.getRegistrations();
    const already = existing.find(
      (r) =>
        r.eventId === input.event.id &&
        r.email.toLowerCase() === input.email.trim().toLowerCase(),
    );
    if (already) {
      return {
        error: 'A registration for this email has already been received for this event.',
      };
    }

    try {
      const record = await storefrontApi.registerForEvent(input.event.id, {
        name: input.name.trim(), email: input.email.trim(), phone: input.phone.trim(), notes: input.notes?.trim(),
      });
      writeStorage(EVENT_REGS_KEY, [record, ...existing]);
      return { registration: record };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not complete registration. Please try again.' };
    }
  },
};

export const communityService = {
  getSamplePosts(): CommunitySubmission[] {
    return SAMPLE_COMMUNITY_POSTS;
  },

  getLocalSubmissions(): CommunitySubmission[] {
    const data = readStorage<CommunitySubmission[]>(COMMUNITY_KEY, []);
    return Array.isArray(data) ? data : [];
  },

  submitPost(input: {
    displayName: string;
    handle: string;
    caption: string;
    image: string;
    taggedPiece?: string;
  }): { submission?: CommunitySubmission; savedToStorage: boolean } {
    const entry: CommunitySubmission = {
      id: `crew-local-${Date.now().toString(36)}`,
      displayName: input.displayName.trim(),
      handle: input.handle.trim().startsWith('@')
        ? input.handle.trim()
        : `@${input.handle.trim()}`,
      caption: input.caption.trim(),
      image: input.image,
      taggedPiece: input.taggedPiece?.trim() || undefined,
      createdAt: new Date().toISOString(),
      isLocalSubmission: true,
    };

    const existing = this.getLocalSubmissions();
    const savedToStorage = writeStorage(COMMUNITY_KEY, [entry, ...existing]);
    return { submission: entry, savedToStorage };
  },
};
