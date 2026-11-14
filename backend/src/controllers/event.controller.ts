import type { Request, Response, NextFunction } from 'express';
import { Event } from '../models/Event.js';
import { sendSuccess } from '../utils/apiResponse.js';
import mongoose from 'mongoose';

const DEFAULT_EVENTS = [
  {
    id: 'evt-01',
    title: 'CircleUp Studio Pop-Up Courtyard',
    date: 'Saturday, November 28, 2026 · 11:00 AM - 6:00 PM',
    location: 'Sector 7 Studio Courtyard, Chandigarh',
    description: 'Browse freshly steamed vintage co-ords, try on corset tops, and enjoy iced matcha in our courtyard garden.',
    image: '/assets/world-social-circle.webp',
    type: 'POP_UP',
    capacity: 100,
    registeredCount: 42,
    isRegistrationOpen: true,
  },
  {
    id: 'evt-02',
    title: 'The Social Circle Community Swap Meet',
    date: 'Sunday, December 6, 2026 · 2:00 PM - 7:00 PM',
    location: 'CircleUp Loft Space, Chandigarh',
    description: 'Bring 3 pre-loved quality garments to trade with fellow thrifters. Sustainable snacks and vinyl music provided.',
    image: '/assets/community-1.webp',
    type: 'COMMUNITY',
    capacity: 50,
    registeredCount: 31,
    isRegistrationOpen: true,
  },
];

export const eventController = {
  async listEvents(_req: Request, res: Response, next: NextFunction) {
    try {
      if (mongoose.connection.readyState === 1) {
        const events = await Event.find().sort({ createdAt: -1 }).lean();
        if (events.length > 0) {
          return sendSuccess(res, events);
        }
      }
      return sendSuccess(res, DEFAULT_EVENTS);
    } catch (error) {
      next(error);
    }
  },
};
