import { Router } from 'express';
import { productController } from './product.controller.js';
import { cacheCatalogReads } from '../../middleware/cacheControl.js';

export const productRouter = Router();

// List all products with filtering & pagination
productRouter.get('/', cacheCatalogReads, productController.list);

// Seed catalog with initial thrift products
productRouter.post('/seed', productController.seed);

// Create a new thrift item (with serialNumber, name, price, stock, images, sizes, etc.)
productRouter.post('/', productController.create);

// Get related products by identifier
productRouter.get('/:identifier/related', cacheCatalogReads, productController.getRelated);

// Get single product by serialNumber, slug, or ID
productRouter.get('/:identifier', cacheCatalogReads, productController.getOne);

// Update product by serialNumber
productRouter.put('/:serialNumber', productController.update);

// Archive product by serialNumber
productRouter.delete('/:serialNumber', productController.delete);

