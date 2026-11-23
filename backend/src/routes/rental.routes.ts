import { Router } from 'express';
import { rentalController } from '../controllers/rental.controller.js';
import { cacheCatalogReads, noStoreCache } from '../middleware/cacheControl.js';
import { userSubmissionRateLimiter } from '../middleware/rateLimiter.js';

export const rentalRouter = Router();

rentalRouter.get('/', cacheCatalogReads, rentalController.listRentals);
rentalRouter.get('/:identifier', cacheCatalogReads, rentalController.getRental);

// Rental booking request submission (persists to Supabase with status 'REQUESTED')
rentalRouter.post('/requests', userSubmissionRateLimiter, noStoreCache, rentalController.submitBookingRequest);
rentalRouter.post('/', userSubmissionRateLimiter, noStoreCache, rentalController.submitBookingRequest);
