import { SAMPLE_COMMUNITY_POSTS } from '@/data/community';
import { SAMPLE_EVENTS } from '@/data/events';
import { SAMPLE_REVIEWS } from '@/data/reviews';
import type {
  CommunitySubmission,
  ContactSubmission,
  EventItem,
  EventRegistration,
  ReviewItem,
} from '@/types/storefront';
import { readStorage, writeStorage } from './storage';

const REVIEWS_KEY = 'circleup_local_reviews_v1';
const EVENT_REGS_KEY = 'circleup_event_regs_v1';
const COMMUNITY_KEY = 'circleup_community_posts_v1';
const CONTACT_KEY = 'circleup_contact_submissions_v1';

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
  getAllEvents(): EventItem[] {
    return SAMPLE_EVENTS;
  },

  getEventById(id: string): EventItem | undefined {
    return SAMPLE_EVENTS.find((evt) => evt.id === id);
  },

  getRegistrations(): EventRegistration[] {
    const data = readStorage<EventRegistration[]>(EVENT_REGS_KEY, []);
    return Array.isArray(data) ? data : [];
  },

  registerForEvent(input: {
    event: EventItem;
    name: string;
    email: string;
    phone: string;
    notes?: string;
  }): { registration?: EventRegistration; error?: string } {
    const existing = this.getRegistrations();
    const already = existing.find(
      (r) =>
        r.eventId === input.event.id &&
        r.email.toLowerCase() === input.email.trim().toLowerCase(),
    );
    if (already) {
      return {
        error: 'A simulated registration for this email is already saved locally for this event.',
      };
    }

    const record: EventRegistration = {
      id: `SIM-EVT-${Date.now().toString(36).toUpperCase()}`,
      eventId: input.event.id,
      eventTitle: input.event.title,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      notes: input.notes?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    writeStorage(EVENT_REGS_KEY, [record, ...existing]);
    return { registration: record };
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

export const contactService = {
  getSubmissions(): ContactSubmission[] {
    const data = readStorage<ContactSubmission[]>(CONTACT_KEY, []);
    return Array.isArray(data) ? data : [];
  },

  saveSubmission(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): { submission: ContactSubmission; savedToStorage: boolean } {
    const entry: ContactSubmission = {
      id: `MSG-${Date.now().toString(36).toUpperCase()}`,
      name: input.name.trim(),
      email: input.email.trim(),
      subject: input.subject.trim(),
      message: input.message.trim(),
      createdAt: new Date().toISOString(),
    };

    const existing = this.getSubmissions();
    const savedToStorage = writeStorage(CONTACT_KEY, [entry, ...existing]);
    return { submission: entry, savedToStorage };
  },
};

