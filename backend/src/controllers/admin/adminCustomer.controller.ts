import type { Request, Response, NextFunction } from 'express';
import { adminCustomerService } from '../../services/adminCustomer.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { z } from 'zod';

const listSchema = z.object({
  page: z.coerce.number().int().positive().max(1_000_000).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  tier: z.enum(['VIP', 'REGULAR', 'NEW', 'COMMUNITY', 'all']).optional(),
}).strict();

const addressSchema = z.object({
  addressLine: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postalCode: z.string().max(30).optional(),
  country: z.string().max(120).optional(),
  landmark: z.string().max(500).optional(),
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().max(5000).optional(),
  tier: z.enum(['VIP', 'REGULAR', 'NEW', 'COMMUNITY']).optional(),
  savedAddresses: z.array(addressSchema).max(20).optional(),
  marketingOptInEmail: z.boolean().optional(),
  marketingOptInWhatsapp: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const lookupSchema = z.string().min(1).max(254).refine((value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
  /^auth_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
  /^guest_[0-9a-f]{32}$/i.test(value) ||
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Invalid customer ID.');

export const adminCustomerController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listSchema.parse(req.query);
      const result = await adminCustomerService.listCustomers(query);
      return sendSuccess(res, result.customers, { meta: result.meta });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = lookupSchema.parse(req.params.id);
      const result = await adminCustomerService.getCustomerById(id);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const patch = updateSchema.parse(req.body);
      return sendSuccess(res, await adminCustomerService.updateCustomer(id, patch));
    } catch (error) {
      next(error);
    }
  },
};

