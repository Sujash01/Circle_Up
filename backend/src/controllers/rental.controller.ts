import type { Request, Response, NextFunction } from 'express';
import { Rental } from '../models/Rental.js';
import { sendSuccess } from '../utils/apiResponse.js';
import mongoose from 'mongoose';

const DEFAULT_RENTALS = [
  {
    id: 'rent-01',
    name: 'Blazer With Skirt Co-Ord Set',
    slug: 'blazer-with-skirt-co-ord-set',
    category: 'rentals',
    image: '/assets/rtw-3.jpg',
    rentalPrice3Days: 120000,
    rentalPrice7Days: 200000,
    rentalPrice14Days: 320000,
    securityDeposit: 300000,
    condition: 'Mint',
    size: 'Size M',
    isAvailable: true,
    description: 'Structured vintage blazer paired with pleated midi skirt. Dry-cleaned and steamed before parcel dispatch.',
  },
  {
    id: 'rent-02',
    name: 'Denim Fit & Flare Set',
    slug: 'denim-fit-and-flare-co-ord-set',
    category: 'rentals',
    image: '/assets/rtw-2.jpg',
    rentalPrice3Days: 95000,
    rentalPrice7Days: 160000,
    rentalPrice14Days: 250000,
    securityDeposit: 200000,
    condition: 'Gently Used',
    size: 'Size XS/S',
    isAvailable: true,
    description: 'Chic indigo flare set with corset waist seams. Ideal for weekend pop-ups, film shoots, and weekend outings.',
  },
];

export const rentalController = {
  async listRentals(_req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const rentals = await Rental.find({ isAvailable: true }).lean();
        if (rentals.length > 0) {
          return sendSuccess(res, rentals);
        }
      }
      return sendSuccess(res, DEFAULT_RENTALS);
    } catch (error) {
      next(error);
    }
  },
};

