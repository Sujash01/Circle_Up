import { Router } from 'express';
import { rentalController } from '../controllers/rental.controller.js';
import { cacheCatalogReads } from '../middleware/cacheControl.js';

export const rentalRouter = Router();

rentalRouter.get('/', cacheCatalogReads, rentalController.listRentals);
rentalRouter.get('/:identifier', cacheCatalogReads, rentalController.getRental);

