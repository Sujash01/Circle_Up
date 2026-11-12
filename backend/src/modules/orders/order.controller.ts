import type { Request, Response, NextFunction } from 'express';
import { orderService } from './order.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';

export const orderController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.createOrder(req.body);
      return sendCreated(res, order, 'Order confirmed successfully');
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await orderService.listOrders({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status as string,
        phone: req.query.phone as string,
      });
      return sendSuccess(res, result.orders, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const orderNumber = String(req.params.orderNumber || '');
      const order = await orderService.getOrderByNumber(orderNumber);
      return sendSuccess(res, order);
    } catch (error) {
      next(error);
    }
  },
};
