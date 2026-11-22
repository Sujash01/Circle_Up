import type { Request, Response, NextFunction } from 'express';
import { rentalRepository } from '../repositories/rental.repository.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const rentalController = {
  async listRentals(_req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await rentalRepository.list(true)); } catch (error) { next(error); }
  },
  async getRental(req: Request, res: Response, next: NextFunction) {
    try { return sendSuccess(res, await rentalRepository.get(String(req.params.identifier || ''))); } catch (error) { next(error); }
  },
};
