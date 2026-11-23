import type { Request, Response, NextFunction } from 'express';
import { adminOverviewService } from '../../services/adminOverview.service.js';
import { adminOrderService } from '../../services/adminOrder.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const adminOverviewController = {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const [metrics, recentOrdersResult] = await Promise.all([
        adminOverviewService.getMetrics(),
        adminOrderService.listOrders({ page: 1, limit: 10 }),
      ]);

      return sendSuccess(res, {
        metrics,
        recentOrders: recentOrdersResult.orders,
      });
    } catch (error) {
      next(error);
    }
  },
};
