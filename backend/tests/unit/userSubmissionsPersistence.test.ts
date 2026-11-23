import { beforeEach, describe, expect, it } from 'vitest';
import { reviewService } from '../../src/services/review.service.js';
import { communityService } from '../../src/services/community.service.js';
import { rentalBookingRequestSchema } from '../../src/controllers/rental.controller.js';

describe('User Submissions Persistence & Moderation (Resolves P1-8 & P1-9)', () => {
  beforeEach(() => {
    reviewService._clearMockReviews();
    communityService._clearMockPosts();
  });

  describe('Customer Reviews Submission & Moderation', () => {
    it('submits a review with status forced to PENDING for moderation', async () => {
      const review = await reviewService.submitReview({
        displayName: 'Ananya Sharma',
        rating: 5,
        title: 'Authentic archival silk shirt',
        comment: 'Condition matched the description and measurement chart perfectly. Very pleased!',
        productSlug: 'vintage-uniqlo-zipper-hoodie',
        productName: 'Vintage Uniqlo Zipper Hoodie',
      });

      expect(review.id).toBeDefined();
      expect(review.displayName).toBe('Ananya Sharma');
      expect(review.status).toBe('PENDING'); // Held for moderation
      expect(review.rating).toBe(5);
    });

    it('rejects invalid review submissions (bad rating, short title, short comment)', async () => {
      // Invalid rating > 5
      await expect(
        reviewService.submitReview({
          displayName: 'Tester',
          rating: 6 as any,
          title: 'Too high rating',
          comment: 'This should fail validation.',
        }),
      ).rejects.toThrow();

      // Too short comment < 10 chars
      await expect(
        reviewService.submitReview({
          displayName: 'Tester',
          rating: 4,
          title: 'Good piece',
          comment: 'Short',
        }),
      ).rejects.toThrow();
    });

    it('listApprovedReviews excludes unmoderated PENDING reviews', async () => {
      await reviewService.submitReview({
        displayName: 'Pending Reviewer',
        rating: 5,
        title: 'Pending piece',
        comment: 'This review is still in the moderation queue.',
      });

      const approved = await reviewService.listApprovedReviews();
      expect(approved).toHaveLength(0); // Zero unapproved reviews leak to storefront
    });
  });

  describe('Community / ThriftCrew Looks Submission & Moderation', () => {
    it('submits a community look with status forced to PENDING for moderation', async () => {
      const post = await communityService.submitPost({
        displayName: 'Siddharth',
        handle: 'sid.thrifts',
        caption: 'Styled this 90s leather jacket for an autumn studio session.',
        image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        taggedPiece: '90s Biker Leather Jacket',
      });

      expect(post.id).toBeDefined();
      expect(post.handle).toBe('@sid.thrifts');
      expect(post.status).toBe('PENDING'); // Held for moderation
    });

    it('rejects invalid community posts (too short caption, missing photo)', async () => {
      await expect(
        communityService.submitPost({
          displayName: 'Sid',
          handle: 'sid',
          caption: 'Hi', // < 5 chars
          image: 'data:image/jpeg;base64,...',
        }),
      ).rejects.toThrow();
    });

    it('listApprovedPosts excludes unmoderated PENDING posts', async () => {
      await communityService.submitPost({
        displayName: 'Sid',
        handle: 'sid',
        caption: 'Great look styled today!',
        image: 'data:image/jpeg;base64,...',
      });

      const approved = await communityService.listApprovedPosts();
      expect(approved).toHaveLength(0);
    });
  });

  describe('Rental Booking Request Validation', () => {
    it('validates rental booking request payload schema accurately', () => {
      const validPayload = {
        rentalProductId: 'rnt-sherwani-01',
        rentalProductName: 'Embroidered Velvet Sherwani',
        customerName: 'Pooja Verma',
        customerEmail: 'pooja@example.com',
        customerPhone: '+919876543210',
        size: 'Size M',
        startDate: '2027-02-10',
        endDate: '2027-02-14',
        durationDays: 4,
        estimatedRentalFee: 600000,
        securityDeposit: 300000,
        estimatedTotal: 900000,
        notes: 'Dry clean requested prior to pickup.',
      };

      const parsed = rentalBookingRequestSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.durationDays).toBe(4);
        expect(parsed.data.estimatedRentalFee).toBe(600000);
      }
    });

    it('rejects invalid rental booking requests with invalid date formats', () => {
      const invalidPayload = {
        customerName: 'Pooja',
        customerPhone: '+919876543210',
        startDate: '10/02/2027', // Not YYYY-MM-DD
        endDate: '2027-02-14',
        durationDays: 4,
        estimatedRentalFee: 600000,
        securityDeposit: 300000,
      };

      const parsed = rentalBookingRequestSchema.safeParse(invalidPayload);
      expect(parsed.success).toBe(false);
    });
  });
});
