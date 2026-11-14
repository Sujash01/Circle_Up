import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp, { type Metadata } from 'sharp';
import { BadRequestError } from '../errors/AppError.js';
import { env } from '../config/env.js';

export interface UploadedImageVariants {
  original: string;
  w400: string;
  w800: string;
  w1600: string;
  hash: string;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const storageService = {
  async processAndStoreImage(fileBuffer: Buffer, _originalFilename: string): Promise<UploadedImageVariants> {
    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError('Image exceeds maximum allowed size of 8MB.', 'FILE_TOO_LARGE');
    }

    // Inspect real image metadata using Sharp to verify genuine MIME/format
    let metadata: Metadata;
    try {
      metadata = await sharp(fileBuffer).metadata();
    } catch {
      throw new BadRequestError('Corrupt or unrecognized image file format.', 'INVALID_IMAGE_FORMAT');
    }

    const allowedFormats = ['jpeg', 'png', 'webp'];
    if (!metadata.format || !allowedFormats.includes(metadata.format)) {
      throw new BadRequestError(
        `Unsupported image format (${metadata.format}). Allowed formats: JPEG, PNG, WebP.`,
        'UNSUPPORTED_FORMAT',
      );
    }

    // Content-hash filename based on SHA-256
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').slice(0, 16);
    const uploadDir = path.resolve(process.cwd(), 'public/uploads');
    await fs.mkdir(uploadDir, { recursive: true });

    // 1. Process 400w variant (thumbnail / grid)
    const buf400 = await sharp(fileBuffer)
      .rotate() // auto-orient and strip EXIF
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    // 2. Process 800w variant (standard detail)
    const buf800 = await sharp(fileBuffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    // 3. Process 1600w variant (high-res zoom)
    const buf1600 = await sharp(fileBuffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    const name400 = `${hash}-400w.webp`;
    const name800 = `${hash}-800w.webp`;
    const name1600 = `${hash}-1600w.webp`;

    await Promise.all([
      fs.writeFile(path.join(uploadDir, name400), buf400),
      fs.writeFile(path.join(uploadDir, name800), buf800),
      fs.writeFile(path.join(uploadDir, name1600), buf1600),
    ]);

    const prefix = env.STORAGE_CDN_URL ? env.STORAGE_CDN_URL.replace(/\/$/, '') : '/uploads';

    return {
      original: `${prefix}/${name800}`,
      w400: `${prefix}/${name400}`,
      w800: `${prefix}/${name800}`,
      w1600: `${prefix}/${name1600}`,
      hash,
    };
  },
};
