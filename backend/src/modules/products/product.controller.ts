import type { Request, Response, NextFunction } from 'express';
import { productService } from './product.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import type { ProductListQuery } from '@circleup/shared';

export const productController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query: ProductListQuery = {
        category: req.query.category as string,
        subcategory: req.query.subcategory as string,
        condition: req.query.condition as string,
        gender: req.query.gender as string,
        size: req.query.size as string,
        minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        inStockOnly: req.query.inStockOnly === 'true',
        newArrivalsOnly: req.query.newArrivalsOnly === 'true',
        featuredOnly: req.query.featuredOnly === 'true',
        search: req.query.search as string,
        sort: req.query.sort as ProductListQuery['sort'],
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      };

      const result = await productService.listProducts(query);
      return sendSuccess(res, result.products, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const identifier = String(req.params.identifier || '');
      const product = await productService.getProductByIdentifier(identifier);
      return sendSuccess(res, product);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await productService.createProduct(req.body);
      return sendCreated(res, product, 'Thrift product created successfully');
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const serialNumber = String(req.params.serialNumber || '');
      const product = await productService.updateProduct(serialNumber, req.body);
      return sendSuccess(res, product, { message: 'Product updated successfully' });
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const serialNumber = String(req.params.serialNumber || '');
      const result = await productService.deleteProduct(serialNumber);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async seed(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await productService.seedCatalog();
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },
};
