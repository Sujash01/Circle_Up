import { Router } from 'express';
import { shippingTaxService } from '../services/shippingTax.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const shippingTaxRouter = Router();

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
    const pincode = String(req.query.pincode || '');
    const subtotal = typeof req.query.subtotalInPaise === 'string' ? parseInt(req.query.subtotalInPaise, 10) : 0;
    const result = await shippingTaxService.calculateDeliveryFee(pincode, subtotal);
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
});
