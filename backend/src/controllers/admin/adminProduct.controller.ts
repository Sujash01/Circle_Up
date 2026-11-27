import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  moneyPaiseSchema,
  productConditionSchema,
  productGenderSchema,
  productMeasurementsSchema,
  productStatusSchema,
  productTypeSchema,
  productVariantSchema,
  productImageSchema,
  type ProductListQuery,
} from '@circleup/shared';
import { adminProductService } from '../../services/adminProduct.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { invalidateHomepageCache } from '../../services/homepage.service.js';
import { BadRequestError } from '../../errors/AppError.js';

const adminConditionSchema = z.union([
  productConditionSchema,
  z.literal('Vintage Worn').transform(() => 'Vintage Wear' as const),
]);

const adminProductListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().max(100).optional(),
  search: z.string().max(200).optional(),
  includeArchived: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  includeDeleted: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

const adminProductCreateSchema = z.object({
  serialNumber: z.string().trim().min(1).max(64).optional(),
  categoryCode: z.string().trim().max(32).optional(),
  sizeCategory: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  slug: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(10000).default(''),
  price: moneyPaiseSchema,
  originalPrice: moneyPaiseSchema.nullable().optional(),
  compareAtPrice: moneyPaiseSchema.nullable().optional(),
  stock: z.coerce.number().int().nonnegative().default(1),
  images: z.array(z.string().min(1)).default([]),
  imageDetails: z.array(productImageSchema).optional(),
  sizes: z.array(z.string().trim().min(1).max(40)).default([]),
  variants: z.array(productVariantSchema).default([]),
  category: z.string().trim().min(1, 'Category is required').max(100),
  categoryLabel: z.string().trim().max(100).optional(),
  subcategory: z.string().trim().max(100).optional(),
  productType: productTypeSchema.optional(),
  condition: adminConditionSchema.optional(),
  gender: productGenderSchema.optional(),
  measurements: z.union([z.string().max(2000), productMeasurementsSchema]).optional(),
  measurementsData: z.record(z.string()).optional(),
  makerNote: z.string().max(2000).optional(),
  tags: z.array(z.string().trim().max(64)).default([]),
  featured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  chestPick: z.boolean().optional(),
  badge: z.string().max(64).optional(),
  sku: z.string().max(64).optional(),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(500).optional(),
  status: productStatusSchema.optional(),
});

const adminProductUpdateSchema = adminProductCreateSchema.partial();

const adminProductBulkSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'archive', 'changeCategory', 'delete']),
  ids: z.array(z.string().trim().min(1)).min(1, 'At least one product ID is required').max(200),
  payload: z.object({
    category: z.string().trim().min(1).max(100).optional(),
  }).optional(),
});

function parseOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
  message = 'Invalid product input.',
): z.infer<TSchema> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestError(
      message,
      'VALIDATION_ERROR',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function parseProductIdParam(rawId: unknown): string {
  const id = String(rawId || '').trim();
  if (!id || id.length > 128 || /[\s/\\]/.test(id)) {
    throw new BadRequestError('Product ID is invalid.', 'VALIDATION_ERROR');
  }
  return id;
}

export const adminProductController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = parseOrThrow(adminProductListQuerySchema, req.query, 'Invalid product list query parameters.') as unknown as ProductListQuery;

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

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const product = await adminProductService.getById(id);
      return sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = parseOrThrow(adminProductCreateSchema, req.body, 'Invalid product creation payload.');
      const product = await adminProductService.create(payload as Record<string, unknown>);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_CREATE',
        entity: 'Product',
        entityId: (product as { id?: string; serialNumber?: string }).id || (product as { serialNumber?: string }).serialNumber || 'unknown',
        diff: payload,
        req,
      });
      invalidateHomepageCache();
      return sendCreated(res, product, 'Product created successfully.');
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const payload = parseOrThrow(adminProductUpdateSchema, req.body, 'Invalid product update payload.');
      const product = await adminProductService.update(id, payload as Record<string, unknown>);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_UPDATE',
        entity: 'Product',
        entityId: id,
        diff: payload,
        req,
      });
      invalidateHomepageCache();
      return sendSuccess(res, product, { message: 'Product updated successfully.' });
    } catch (error) {
      next(error);
    }
  },

  async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const duplicated = await adminProductService.duplicate(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_DUPLICATE',
        entity: 'Product',
        entityId: (duplicated as { id?: string }).id || id,
        req,
      });
      invalidateHomepageCache();
      return sendCreated(res, duplicated, 'Product duplicated as draft.');
    } catch (error) {
      next(error);
    }
  },

  async bulk(req: Request, res: Response, next: NextFunction) {
    try {
      const { action, ids, payload } = parseOrThrow(adminProductBulkSchema, req.body, 'Invalid bulk product action payload.');
      const result = await adminProductService.bulkAction(action, ids, payload);
      await auditService.record({
        actor: req.adminUser,
        action: `PRODUCT_BULK_${action.toUpperCase()}`,
        entity: 'Product',
        entityId: ids.join(','),
        diff: { ids, payload },
        req,
      });
      invalidateHomepageCache();
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async softDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const result = await adminProductService.softDelete(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_SOFT_DELETE',
        entity: 'Product',
        entityId: id,
        req,
      });
      invalidateHomepageCache();
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const result = await adminProductService.restore(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_RESTORE',
        entity: 'Product',
        entityId: id,
        req,
      });
      invalidateHomepageCache();
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async permanentDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = parseProductIdParam(req.params.id);
      const result = await adminProductService.permanentDelete(id);
      await auditService.record({
        actor: req.adminUser,
        action: 'PRODUCT_PERMANENT_DELETE',
        entity: 'Product',
        entityId: id,
        req,
      });
      invalidateHomepageCache();
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
