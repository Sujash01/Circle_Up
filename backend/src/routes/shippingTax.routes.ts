import { Router } from 'express';
import { checkoutPinCodeSchema } from '@circleup/shared';
import { z } from 'zod';
import { BadRequestError } from '../errors/AppError.js';
import { shippingTaxService } from '../services/shippingTax.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const shippingTaxRouter = Router();

const nonnegativeIntegerQuery = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().safe().nonnegative());

const deliveryFeeQuerySchema = z.object({
  pincode: checkoutPinCodeSchema.optional(),
  subtotalInPaise: nonnegativeIntegerQuery.default('0'),
  itemCount: nonnegativeIntegerQuery.optional(),
}).strict();

shippingTaxRouter.get('/shipping-zones', async (_req, res, next) => {
  try {
    const zones = await shippingTaxService.getShippingZones();
    return sendSuccess(res, zones);
  } catch (error) {
    next(error);
  }
});

shippingTaxRouter.get('/tax-settings', async (_req, res, next) => {
  try {
    const settings = await shippingTaxService.getTaxSettings();
    return sendSuccess(res, settings);
  } catch (error) {
    next(error);
  }
});

shippingTaxRouter.get('/calculate-fee', async (req, res, next) => {
  try {
    const query = deliveryFeeQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new BadRequestError('Provide a subtotal in integer paise and, when supplied, a valid PIN code and non-negative item count.', 'VALIDATION_ERROR');
    }
    const { subtotalInPaise, itemCount = Number(subtotalInPaise > 0) } = query.data;
    const result = shippingTaxService.calculateDeliveryFee(subtotalInPaise, itemCount);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
});
