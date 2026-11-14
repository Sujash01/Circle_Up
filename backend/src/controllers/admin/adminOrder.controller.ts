import type { Request, Response, NextFunction } from 'express';
import { adminOrderService } from '../../services/adminOrder.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

export const adminOrderController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await adminOrderService.listOrders({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status as string,
        search: req.query.search as string,
      });
      return sendSuccess(res, result.orders, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { status } = req.body;
      const order = await adminOrderService.updateOrderStatus(id, status);

      await auditService.record({
        actor: req.adminUser,
        action: 'ORDER_STATUS_UPDATE',
        entity: 'Order',
        entityId: id,
        diff: { newStatus: status },
        req,
      });

      return sendSuccess(res, order, { message: `Order status updated to ${status}.` });
    } catch (error) {
      next(error);
    }
  },
};
