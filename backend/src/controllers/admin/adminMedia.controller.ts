import type { Request, Response, NextFunction } from 'express';
import { storageService, type UploadedImageVariants } from '../../services/storage.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated, sendSuccess } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';
import { z } from 'zod';

const collectionSchema = z.enum(['products', 'events', 'rentals', 'general']).default('products');
const deleteSchema = z.object({ url: z.string().url().max(2048) }).strict();

export const adminMediaController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const file = req.file as Express.Multer.File | undefined;

      const uploadList: Express.Multer.File[] = files && files.length > 0 ? files : file ? [file] : [];
      if (uploadList.length === 0) {
        throw new BadRequestError('At least one file must be uploaded.', 'NO_FILE_UPLOADED');
      }
      if (uploadList.length > 10) {
        throw new BadRequestError('A maximum of 10 images can be uploaded at once.', 'TOO_MANY_FILES');
      }
      const collection = collectionSchema.parse(req.body?.collection);

      const results: UploadedImageVariants[] = [];
      try {
        for (const f of uploadList) {
          const stored = await storageService.processAndStoreImage(f.buffer, f.originalname, collection, f.mimetype);
          results.push(stored);
        }
      } catch (error) {
        await Promise.allSettled(results.map((result) => storageService.deleteImage(result.w800)));
        throw error;
      }

      await auditService.record({
        actor: req.adminUser,
        action: 'MEDIA_UPLOAD',
        entity: 'Media',
        entityId: results.map((r) => r.hash).join(','),
        req,
      });

      return sendCreated(res, results.length === 1 ? results[0] : results, 'Media uploaded successfully.');
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { url } = deleteSchema.parse(req.body);
      const result = await storageService.deleteImage(url);
      return sendSuccess(res, result, { message: 'Image deleted successfully.' });
    } catch (error) {
      next(error);
    }
  },
};

