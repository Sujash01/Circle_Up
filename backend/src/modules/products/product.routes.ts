import { Router } from 'express';
import { productController } from './product.controller.js';

export const productRouter = Router();

// List all products with filtering & pagination
productRouter.get('/', productController.list);

// Seed catalog with initial thrift products
productRouter.post('/seed', productController.seed);

// Create a new thrift item (with serialNumber, name, price, stock, images, sizes, etc.)
productRouter.post('/', productController.create);

// Get single product by serialNumber, slug, or ID
productRouter.get('/:identifier', productController.getOne);

// Update product by serialNumber
productRouter.put('/:serialNumber', productController.update);

// Archive product by serialNumber
productRouter.delete('/:serialNumber', productController.delete);

