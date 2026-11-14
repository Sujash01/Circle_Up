import { Router } from 'express';
import { categoryController } from '../controllers/category.controller.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';

export const categoryRouter = Router();

categoryRouter.get('/categories', cacheCatalogReads, categoryController.listCategories);
categoryRouter.get('/collections', cacheCatalogReads, categoryController.listCollections);
