import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { NEW_PRODUCT_MIN_STOCK_MESSAGE } from '@circleup/shared';
import { BadRequestError } from '../../src/errors/AppError.js';

const { mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('../../src/services/adminProduct.service.js', () => ({
  adminProductService: {
    create: mockCreate,
    update: mockUpdate,
  },
}));

vi.mock('../../src/services/audit.service.js', () => ({
  auditService: { record: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../src/services/homepage.service.js', () => ({
  invalidateHomepageCache: vi.fn(),
}));

import { adminProductController } from '../../src/controllers/admin/adminProduct.controller.js';
import { adminAuthController } from '../../src/controllers/admin/adminAuth.controller.js';

function createMockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('Minimum Stock 15 for New Products & Admin Session Metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: 'prod-1', serialNumber: 'CU-WT-100' });
    mockUpdate.mockResolvedValue({ id: 'prod-1', serialNumber: 'CU-WT-100', stock: 0 });
  });

  it('rejects creating a New With Tags product with stock below 15', async () => {
    const req = {
      body: {
        name: 'Studio Cotton Shirt',
        price: 150000,
        stock: 10,
        category: 'womens-upperwear',
        condition: 'New With Tags',
      },
    } as Request;
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await adminProductController.create(req, res, next);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toBe(NEW_PRODUCT_MIN_STOCK_MESSAGE);
  });

  it('enforces minimum 15 against total variant stock and allows >= 15', async () => {
    const failReq = {
      body: {
        name: 'Studio Tee',
        price: 90000,
        stock: 14,
        category: 'womens-upperwear',
        productType: 'Fresh Find',
        variants: [
          { id: 'v1', label: 'S', size: 'S', stock: 8 },
          { id: 'v2', label: 'M', size: 'M', stock: 6 },
        ],
      },
    } as Request;
    const nextFail = vi.fn() as unknown as NextFunction;
    await adminProductController.create(failReq, createMockRes(), nextFail);
    expect(mockCreate).not.toHaveBeenCalled();

    const passReq = {
      body: {
        name: 'Studio Tee',
        price: 90000,
        stock: 15,
        category: 'womens-upperwear',
        productType: 'Fresh Find',
        variants: [
          { id: 'v1', label: 'S', size: 'S', stock: 8 },
          { id: 'v2', label: 'M', size: 'M', stock: 7 },
        ],
      },
    } as Request;
    const nextPass = vi.fn() as unknown as NextFunction;
    await adminProductController.create(passReq, createMockRes(), nextPass);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('allows stock 1 for pre-loved and thrifted-treasure items and allows 0 on update', async () => {
    const thriftReq = {
      body: {
        name: 'Vintage Pocket Radio',
        price: 180000,
        stock: 1,
        category: 'thrifted-treasure',
        condition: 'Vintage Wear',
      },
    } as Request;
    await adminProductController.create(thriftReq, createMockRes(), vi.fn() as unknown as NextFunction);

    const preLovedReq = {
      body: {
        name: 'Pre-Loved Blazer',
        price: 220000,
        stock: 1,
        category: 'womens-upperwear',
        condition: 'Mint',
      },
    } as Request;
    await adminProductController.create(preLovedReq, createMockRes(), vi.fn() as unknown as NextFunction);

    expect(mockCreate).toHaveBeenCalledTimes(2);

    const updateReq = {
      params: { id: 'CU-WT-100' },
      body: { stock: 0 },
    } as unknown as Request;
    await adminProductController.update(updateReq, createMockRes(), vi.fn() as unknown as NextFunction);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('returns session expiry and idle metadata from GET /api/admin/auth/me', async () => {
    const req = {
      adminUser: {
        userId: 'u1',
        email: 'owner@circleup.in',
        name: 'Owner',
        role: 'owner',
        permissions: [],
        csrfToken: 'csrf-1',
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        lastActiveAt: Date.now(),
        sessionId: 'sess-1',
      },
    } as unknown as Request;
    const res = createMockRes();
    await adminAuthController.me(req, res, vi.fn() as unknown as NextFunction);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.data.session.idleTimeoutMs).toBe(2 * 60 * 60 * 1000);
    expect(payload.data.session.expiresAt).toBeGreaterThan(Date.now());
    expect(payload.data.session.idleExpiresAt).toBeGreaterThan(Date.now());
  });
});
