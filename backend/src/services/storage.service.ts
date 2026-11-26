import crypto from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import { BadRequestError, ConflictError, ServiceUnavailableError } from '../errors/AppError.js';
import { getSupabaseServiceClient } from '../config/supabase.js';

export type MediaCollection = 'products' | 'events' | 'rentals' | 'general';

export interface UploadedImageVariants {
  original: string;
  w400: string;
  w800: string;
  w1600: string;
  hash: string;
}

const BUCKET = 'product-images';
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const VARIANTS = ['400w.webp', '800w.webp', '1600w.webp'] as const;
const COLLECTIONS = new Set<MediaCollection>(['products', 'events', 'rentals', 'general']);
const MIME_BY_FORMAT: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const ALLOWED_MIMES_BY_FORMAT: Record<string, string[]> = {
  jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/jfif'],
  png: ['image/png', 'image/x-png'],
  webp: ['image/webp'],
};
const unavailable = (message = 'Supabase Storage is unavailable.') => new ServiceUnavailableError(message, 'STORAGE_UNAVAILABLE');

let bucketEnsured = false;
async function ensureBucket(client: ReturnType<typeof getSupabaseServiceClient>): Promise<void> {
  if (bucketEnsured) return;
  try {
    if (typeof client.storage?.getBucket === 'function') {
      const { data: bucket, error } = await client.storage.getBucket(BUCKET);
      if (!bucket || error) {
        if (typeof client.storage?.createBucket === 'function') {
          await client.storage.createBucket(BUCKET, {
            public: true,
            fileSizeLimit: 10 * 1024 * 1024,
            allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
          });
        }
      }
    }
    bucketEnsured = true;
  } catch {
    // If bucket creation fails or client doesn't support getBucket/createBucket (e.g. mock),
    // proceed and let upload attempt directly
  }
}

function getVariantBuffers(input: Buffer) {
  return Promise.all([
    sharp(input).rotate().resize({ width: 400, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
    sharp(input).rotate().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
    sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer(),
  ]);
}

async function inspectImage(fileBuffer: Buffer, declaredMimeType?: string): Promise<Metadata> {
  if (!fileBuffer.length) throw new BadRequestError('Image file is empty.', 'INVALID_IMAGE_FORMAT');
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new BadRequestError('Image exceeds maximum allowed size of 8MB.', 'FILE_TOO_LARGE');
  }
  let metadata: Metadata;
  try { metadata = await sharp(fileBuffer, { failOn: 'error' }).metadata(); }
  catch { throw new BadRequestError('Corrupt or unrecognized image file format.', 'INVALID_IMAGE_FORMAT'); }
  if (!metadata.format || !MIME_BY_FORMAT[metadata.format]) {
    throw new BadRequestError('Unsupported image format. Allowed formats: JPEG, PNG, WebP.', 'UNSUPPORTED_FORMAT');
  }
  if (declaredMimeType) {
    const cleanDeclared = declaredMimeType.split(';')[0]?.toLowerCase().trim() || '';
    if (cleanDeclared && cleanDeclared !== 'application/octet-stream') {
      const allowedMimes = ALLOWED_MIMES_BY_FORMAT[metadata.format] || [MIME_BY_FORMAT[metadata.format]];
      if (!allowedMimes.includes(cleanDeclared)) {
        throw new BadRequestError('Uploaded MIME type does not match the image contents.', 'MIME_CONTENT_MISMATCH');
      }
    }
  }
  return metadata;
}

function publicObjectUrl(client: ReturnType<typeof getSupabaseServiceClient>, path: string): string {
  const result = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  if (!result || typeof result !== 'string') throw unavailable('Supabase Storage did not return a public image URL.');
  return result;
}

function pathFor(collection: MediaCollection, digest: string, objectUuid: string, variant: typeof VARIANTS[number]) {
  return `${collection}/${digest}/${objectUuid}/${variant}`;
}

function validateCollection(collection: string): asserts collection is MediaCollection {
  if (!COLLECTIONS.has(collection as MediaCollection)) throw new BadRequestError('Invalid media collection.', 'INVALID_MEDIA_COLLECTION');
}

function managedImagePaths(imageUrl: string): { collection: MediaCollection; digest: string; urls: string[]; paths: string[] } {
  let parsed: URL;
  try { parsed = new URL(imageUrl); }
  catch { throw new BadRequestError('Invalid managed image URL.', 'INVALID_IMAGE_URL'); }
  const client = getSupabaseServiceClient();
  const parts = parsed.pathname.split('/').filter(Boolean);
  const publicIndex = parts.findIndex((part, index) => part === 'public' && parts[index - 1] === 'object');
  if (publicIndex < 0 || parts[publicIndex + 1] !== BUCKET) throw new BadRequestError('Image is not stored in the managed public media bucket.', 'UNMANAGED_IMAGE_URL');
  let objectPath = '';
  try { objectPath = decodeURIComponent(parts.slice(publicIndex + 2).join('/')); }
  catch { throw new BadRequestError('Invalid managed image URL.', 'INVALID_IMAGE_URL'); }
  const objectParts = objectPath.split('/');
  if (objectParts.length !== 4) throw new BadRequestError('Invalid managed image path.', 'INVALID_IMAGE_URL');
  const [collection, digest, objectUuid, variant] = objectParts;
  const safeCollection = collection || '';
  const safeDigest = digest || '';
  const safeObjectUuid = objectUuid || '';
  validateCollection(safeCollection);
  if (!/^[a-f0-9]{64}$/.test(safeDigest) || !/^[0-9a-f-]{36}$/i.test(safeObjectUuid) || !VARIANTS.includes(variant as typeof VARIANTS[number])) {
    throw new BadRequestError('Invalid managed image path.', 'INVALID_IMAGE_URL');
  }
  const paths = VARIANTS.map((name) => pathFor(safeCollection, safeDigest, safeObjectUuid, name));
  const urls = paths.map((path) => publicObjectUrl(client, path));
  const urlMatches = urls.some((u) => {
    if (u === imageUrl) return true;
    try {
      const uParsed = new URL(u);
      return uParsed.pathname === parsed.pathname;
    } catch {
      return false;
    }
  });
  if (!urlMatches) throw new BadRequestError('Image URL is not canonical for this storage bucket.', 'INVALID_IMAGE_URL');
  return { collection: safeCollection, digest: safeDigest, urls, paths };
}

async function assertImageUnreferenced(imageUrls: string[]): Promise<void> {
  const client = getSupabaseServiceClient();
  try {
    for (const url of imageUrls) {
      const results = await Promise.all([
        client.from('products').select('id').contains('images', [url]).limit(1),
        client.from('events').select('id').eq('image_url', url).limit(1),
        client.from('rental_catalog_items').select('id').eq('image_url', url).limit(1),
        client.from('order_items').select('id').eq('image_url', url).limit(1),
      ]);
      if (results.some(({ error }) => error)) throw unavailable('Unable to verify media references before deletion.');
      if (results.some(({ data }) => Array.isArray(data) && data.length > 0)) {
        throw new ConflictError('This image is still referenced by a product, event, rental, or order.', 'IMAGE_IN_USE');
      }
    }
  } catch (error) {
    if (error instanceof ConflictError || error instanceof ServiceUnavailableError) throw error;
    throw unavailable('Unable to verify media references before deletion.');
  }
}

export const storageService = {
  async processAndStoreImage(fileBuffer: Buffer, _originalFilename: string, collection: MediaCollection = 'products', declaredMimeType?: string): Promise<UploadedImageVariants> {
    validateCollection(collection);
    await inspectImage(fileBuffer, declaredMimeType);
    let variants: Buffer[];
    try { variants = await getVariantBuffers(fileBuffer); }
    catch { throw new BadRequestError('Image could not be processed.', 'IMAGE_PROCESSING_FAILED'); }

    const fullHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const hash = fullHash.slice(0, 16);
    const objectUuid = crypto.randomUUID();
    const paths = VARIANTS.map((variant) => pathFor(collection, fullHash, objectUuid, variant));
    const client = getSupabaseServiceClient();
    await ensureBucket(client);
    const bucket = client.storage.from(BUCKET);
    const storedPaths: string[] = [];

    try {
      for (const [index, path] of paths.entries()) {
        let uploadResult = await bucket.upload(path, variants[index]!, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });

        if (uploadResult.error && (uploadResult.error.message?.toLowerCase().includes('not found') || (uploadResult.error as { statusCode?: number }).statusCode === 404)) {
          bucketEnsured = false;
          await ensureBucket(client);
          uploadResult = await bucket.upload(path, variants[index]!, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: false,
          });
        }

        const { data, error } = uploadResult;
        if (error || !data) throw unavailable(error?.message || 'Supabase Storage did not confirm image upload.');
        storedPaths.push(path);
      }
    } catch (error) {
      if (storedPaths.length) {
        try { await bucket.remove(storedPaths); } catch { /* Preserve the upload error; a later storage sweep can clean up. */ }
      }
      if (error instanceof ServiceUnavailableError || error instanceof BadRequestError) throw error;
      const msg = error instanceof Error ? error.message : 'Supabase Storage is unavailable.';
      throw unavailable(msg);
    }

    const urls = paths.map((path) => publicObjectUrl(client, path));
    return {
      original: urls[1]!,
      w400: urls[0]!,
      w800: urls[1]!,
      w1600: urls[2]!,
      hash,
    };
  },

  async deleteImage(imageUrl: string): Promise<{ deleted: boolean }> {
    const client = getSupabaseServiceClient();
    const managed = managedImagePaths(imageUrl);
    await assertImageUnreferenced(managed.urls);
    const { data, error } = await client.storage.from(BUCKET).remove(managed.paths);
    if (error || !data || data.length !== managed.paths.length) throw unavailable(error?.message || 'Supabase Storage did not confirm image deletion.');
    return { deleted: true };
  },

  _resetBucketCacheForTesting(): void {
    bucketEnsured = false;
  },
};
