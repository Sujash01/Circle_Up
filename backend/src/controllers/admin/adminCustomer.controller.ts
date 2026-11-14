import type { Request, Response, NextFunction } from 'express';
import { adminCustomerService } from '../../services/adminCustomer.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const adminCustomerController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminCustomerService.listCustomers({
        page: req.query.page,
        limit: req.query.limit,
        search: req.query.search as string,
        tier: req.query.tier as string,
      });
      return sendSuccess(res, result.customers, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminCustomerService.getCustomerById(String(req.params.id));
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
