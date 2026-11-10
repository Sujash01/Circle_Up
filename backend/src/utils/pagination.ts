import { STORE_DEFAULTS, type PaginationMeta } from '@circleup/shared';

export interface ParsedPagination {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Normalizes page and limit query parameters against global storefront boundaries.
 */
export function parsePagination(query: { page?: unknown; limit?: unknown }): ParsedPagination {
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? STORE_DEFAULTS.DEFAULT_PAGINATION_LIMIT);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const boundedLimit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), STORE_DEFAULTS.MAX_PAGINATION_LIMIT)
      : STORE_DEFAULTS.DEFAULT_PAGINATION_LIMIT;

  return {
    page,
    limit: boundedLimit,
    skip: (page - 1) * boundedLimit,
  };
}

/**
 * Builds standard PaginationMeta from total document count.
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
  };
}

