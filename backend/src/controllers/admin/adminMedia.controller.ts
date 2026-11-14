import type { Request, Response, NextFunction } from 'express';
import { storageService, type UploadedImageVariants } from '../../services/storage.service.js';
import { auditService } from '../../services/audit.service.js';
import { sendCreated } from '../../utils/apiResponse.js';
import { BadRequestError } from '../../errors/AppError.js';

export const adminMediaController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const file = req.file as Express.Multer.File | undefined;

      const uploadList: Express.Multer.File[] = files && files.length > 0 ? files : file ? [file] : [];
      if (uploadList.length === 0) {
        throw new BadRequestError('At least one file must be uploaded.', 'NO_FILE_UPLOADED');
      }

      const results: UploadedImageVariants[] = [];
      for (const f of uploadList) {
        const stored = await storageService.processAndStoreImage(f.buffer, f.originalname);
        results.push(stored);
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
};

