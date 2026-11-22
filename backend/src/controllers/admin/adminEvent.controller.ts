import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BadRequestError } from '../../errors/AppError.js';
import { eventRepository } from '../../repositories/event.repository.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

const eventSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  date: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(300),
  description: z.string().max(10000),
  image: z.string().max(2048).optional().default(''),
  type: z.enum(['POP_UP', 'COMMUNITY', 'OFFLINE_SALE']).default('POP_UP'),
  capacity: z.number().int().positive().optional().nullable(),
  registeredCount: z.number().int().nonnegative().default(0),
  isRegistrationOpen: z.boolean().default(true),
}).strict();

function parseInput(body: unknown) {
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestError('Event fields are invalid.', 'VALIDATION_ERROR', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })));
  return parsed.data;
}

export const adminEventController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await eventRepository.list(false)); } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await eventRepository.create(parseInput(req.body));
      await auditService.record({ actor: req.adminUser, action: 'EVENT_CREATE', entity: 'Event', entityId: String(created.id), diff: req.body, req });
      return sendSuccess(res, created, { statusCode: 201 });
    } catch (error) { next(error); }
  },
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || '');
      const updated = await eventRepository.update(id, parseInput(req.body));
      await auditService.record({ actor: req.adminUser, action: 'EVENT_UPDATE', entity: 'Event', entityId: id, diff: req.body, req });
      return sendSuccess(res, updated);
    } catch (error) { next(error); }
  },
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || '');
      await eventRepository.delete(id);
      await auditService.record({ actor: req.adminUser, action: 'EVENT_DELETE', entity: 'Event', entityId: id, req });
      return sendSuccess(res, { deleted: true });
    } catch (error) { next(error); }
  },
};
