import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';
import { eventRegistrationRateLimiter } from '../middleware/rateLimiter.js';

export const eventRouter = Router();

eventRouter.get('/', cacheCatalogReads, eventController.listEvents);
eventRouter.get('/:id', cacheCatalogReads, eventController.getEvent);
eventRouter.post('/:id/registrations', eventRegistrationRateLimiter, eventController.register);

