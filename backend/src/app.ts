import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { corsOptions } from './config/cors.js';
import { errorHandler } from './errors/errorHandler.js';
import { NotFoundError } from './errors/AppError.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { attachRequestId, httpLogger } from './middleware/requestContext.js';
import { sanitizeRequest } from './middleware/sanitize.js';
import { healthRouter } from './modules/health/health.routes.js';
import { productRouter } from './modules/products/product.routes.js';
import { orderRouter } from './modules/orders/order.routes.js';
import { contactRouter } from './modules/contact/contact.routes.js';

/**
 * Constructs and configures the modular Express application without binding a port,
 * enabling clean Supertest integration testing.
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  // 1. Request correlation & structured logging
  app.use(attachRequestId);
  app.use(httpLogger);

  // 2. Security headers, strict CORS, body/cookie parsing, NoSQL sanitization & rate limit
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);
  app.use('/api', globalRateLimiter);

  // 3. Versioned API routes
  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/products', productRouter);
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/contact', contactRouter);

  // 4. 404 fallback & global error serialization
  app.use((_req, _res, next) => {
    next(new NotFoundError('API endpoint not found', 'ROUTE_NOT_FOUND'));
  });
  app.use(errorHandler);

  return app;
}

