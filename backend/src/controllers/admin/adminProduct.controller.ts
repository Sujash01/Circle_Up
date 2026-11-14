import type { Request, Response, NextFunction } from 'express';
import { adminProductService } from '../../services/adminProduct.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import type { ProductListQuery } from '@circleup/shared';

export const adminProductController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = {
        page: req.query.page,
        limit: req.query.limit,
        category: req.query.category as string,
        search: req.query.search as string,
        includeArchived: req.query.includeArchived === 'true',
        includeDeleted: req.query.includeDeleted === 'true',
      } as unknown as ProductListQuery;

      const result = await adminProductService.listAll(query);
      const page = result.page || 1;
      const limit = result.limit || 20;
      return sendSuccess(res, result.products, {
        meta: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit) || 1,
          hasNext: page * limit < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await adminProductService.create(req.body);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_CREATE',
        entity: 'Product',
        entityId: (product as { id?: string; serialNumber?: string }).id || (product as { serialNumber?: string }).serialNumber || 'unknown',
        diff: req.body,
        req,
      });
      return sendCreated(res, product, 'Product created successfully.');
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const product = await adminProductService.update(id, req.body);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_UPDATE',
        entity: 'Product',
        entityId: id,
        diff: req.body,
        req,
      });
      return sendSuccess(res, product, { message: 'Product updated successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const duplicated = await adminProductService.duplicate(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_DUPLICATE',
        entity: 'Product',
        entityId: (duplicated as { id?: string }).id || id,
        req,
      });
      return sendCreated(res, duplicated, 'Product duplicated as draft.');
    } catch (error) {
      next(error);
    }
  },

  async bulk(req: Request, res: Response, next: NextFunction) {
    try {
      const { action, ids, payload } = req.body;
      const result = await adminProductService.bulkAction(action, ids, payload);
      await auditService.record({
        actor: req.adminUser,
        action: `PRODUCT_BULK_${String(action).toUpperCase()}`,
        entity: 'Product',
        entityId: ids.join(','),
        diff: { ids, payload },
        req,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async softDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await adminProductService.softDelete(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_SOFT_DELETE',
        entity: 'Product',
        entityId: id,
        req,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await adminProductService.restore(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_RESTORE',
        entity: 'Product',
        entityId: id,
        req,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async permanentDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await adminProductService.permanentDelete(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_PERMANENT_DELETE',
        entity: 'Product',
        entityId: id,
        req,
      });
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
