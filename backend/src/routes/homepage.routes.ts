import { Router } from 'express';
import { homepageController } from '../controllers/homepage.controller.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';

export const homepageRouter = Router();

homepageRouter.get('/', cacheCatalogReads, homepageController.getHomepage);
