import { Router } from 'express';
import { eventController } from '../controllers/event.controller.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';

export const eventRouter = Router();

eventRouter.get('/', cacheCatalogReads, eventController.listEvents);

