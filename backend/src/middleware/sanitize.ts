import type { NextFunction, Request, Response } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively clones plain objects/arrays while dropping MongoDB operator keys
 * ('$' prefixes, dotted keys) and prototype pollution keys.
 */
export function sanitizeValue<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeValue(item)) as unknown as T;
  }

  if (input !== null && typeof input === 'object' && !(input instanceof Date)) {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
        continue;
      }
      clean[key] = sanitizeValue(value);
    }
    return clean as T;
  }

  return input;
}

/**
 * Express middleware removing dangerous MongoDB query operators from request inputs.
 */
export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}

