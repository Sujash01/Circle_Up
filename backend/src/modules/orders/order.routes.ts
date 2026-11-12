import { Router } from 'express';
import { orderController } from './order.controller.js';

export const orderRouter = Router();

// Place new order
orderRouter.post('/', orderController.create);

// List orders
orderRouter.get('/', orderController.list);

// Get order details by orderNumber
orderRouter.get('/:orderNumber', orderController.getOne);

