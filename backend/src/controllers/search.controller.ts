import type { Request, Response, NextFunction } from 'express';
import { searchService } from '../services/search.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const searchController = {
  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '');
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 48) : 12;
      const page = req.query.page ? Math.max(Number(req.query.page), 1) : 1;
      const mode = String(req.query.mode || '');
      const isSuggestions = mode === 'suggestions' || req.query.suggestions === 'true' || limit <= 6;

      const result = await searchService.searchCatalog(q, limit, page, isSuggestions);

      return sendSuccess(res, result.results, {
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit) || 1,
          hasNext: result.page * result.limit < result.total,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

