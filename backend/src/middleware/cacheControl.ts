import type { Request, Response, NextFunction } from 'express';

export function cacheCatalogReads(_req: Request, res: Response, next: NextFunction): void {
  // 60 seconds fresh, 5 minutes stale-while-revalidate for read catalogue
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  next();
}

export function noStoreCache(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
}

