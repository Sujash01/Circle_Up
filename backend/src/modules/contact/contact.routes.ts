import { Router, type Request, type Response, type NextFunction } from 'express';
import { Inquiry } from '../../models/Inquiry.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import mongoose from 'mongoose';

export const contactRouter = Router();

contactRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      throw new BadRequestError('Name, email, and message are required.', 'MISSING_FIELDS');
    }

    if (mongoose.connection.readyState === 1) {
      const inquiry = await Inquiry.create({
        name,
        email,
        subject: subject || 'General Inquiry',
        message,
      });
      return sendCreated(res, inquiry, 'Thank you! Your message has been received.');
    }

    return sendCreated(
      res,
      { name, email, subject, message, receivedAt: new Date().toISOString() },
      'Thank you! Your message has been received.',
    );
  } catch (error) {
    next(error);
  }
});

