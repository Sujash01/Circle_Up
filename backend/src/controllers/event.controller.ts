import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../errors/AppError.js';
import { eventRepository } from '../repositories/event.repository.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().regex(/^[+\d\s-]{8,15}$/),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const eventController = {
  async listEvents(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await eventRepository.list(true)); } catch (error) { next(error); }
  },
  async getEvent(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await eventRepository.get(String(req.params.id || ''), true)); } catch (error) { next(error); }
  },
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = registrationSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError('Event registration is invalid.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })));
      return sendCreated(res, await eventRepository.register(String(req.params.id || ''), parsed.data));
    } catch (error) { next(error); }
  },
};
