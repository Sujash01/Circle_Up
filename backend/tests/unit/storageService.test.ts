import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uploads: [] as Array<{ path: string; contentType: string; upsert: boolean }>,
  removed: [] as string[][],
  failUploadAt: 0,
  referenceError: false,
  references: new Set<string>(),
}));

vi.mock('../../src/config/supabase.js', () => ({
  getSupabaseServiceClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, _body: Buffer, options: { contentType: string; upsert: boolean }) => {
          state.uploads.push({ path, contentType: options.contentType, upsert: options.upsert });
          if (state.failUploadAt && state.uploads.length === state.failUploadAt) return { data: null, error: new Error('storage offline') };
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://circleup.supabase.co/storage/v1/object/public/product-images/${path}` } }),
        remove: async (paths: string[]) => {
          state.removed.push(paths);
          return { data: paths.map((path) => ({ name: path })), error: null };
        },
      }),
    },
    from: (table: string) => {
      const query: { table: string; value?: string } = { table };
      const builder: any = {
        select: () => builder,
        contains: (_field: string, values: string[]) => { query.value = values[0]; return builder; },
        eq: (_field: string, value: string) => { query.value = value; return builder; },
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
          if (state.referenceError) return Promise.resolve({ data: null, error: new Error('database offline') }).then(resolve, reject);
          const referenced = query.value ? state.references.has(query.value) : false;
          return Promise.resolve({ data: referenced ? [{ id: 'ref-1' }] : [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

import { storageService } from '../../src/services/storage.service.js';
import { BadRequestError } from '../../src/errors/AppError.js';

async function pngBuffer() {
  return sharp({ create: { width: 32, height: 20, channels: 3, background: { r: 40, g: 50, b: 60 } } }).png().toBuffer();
}

describe('Supabase Storage image lifecycle', () => {
  beforeEach(() => {
    state.uploads = [];
    state.removed = [];
    state.failUploadAt = 0;
    state.referenceError = false;
    state.references = new Set();
  });

  it('validates image bytes and MIME, processes variants, and stores public objects in a scoped path', async () => {
    const file = await pngBuffer();
    const result = await storageService.processAndStoreImage(file, '../../unsafe.png', 'products', 'image/png');
    expect(state.uploads).toHaveLength(3);
    expect(state.uploads.map((item) => item.contentType)).toEqual(['image/webp', 'image/webp', 'image/webp']);
    expect(state.uploads.every((item) => item.upsert === false)).toBe(true);
    expect(state.uploads.map((item) => item.path)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^products\/[a-f0-9]{64}\/[0-9a-f-]{36}\/400w\.webp$/),
      expect.stringMatching(/^products\/[a-f0-9]{64}\/[0-9a-f-]{36}\/800w\.webp$/),
      expect.stringMatching(/^products\/[a-f0-9]{64}\/[0-9a-f-]{36}\/1600w\.webp$/),
    ]));
    expect(result.w400).toContain('/storage/v1/object/public/product-images/products/');
    expect(result.original).toBe(result.w800);
    const replacement = await storageService.processAndStoreImage(file, 'renamed.png', 'products', 'image/png');
    expect(replacement.hash).toBe(result.hash);
    expect(replacement.w800).not.toBe(result.w800);
    expect(state.uploads).toHaveLength(6);
    await expect(storageService.processAndStoreImage(file, 'mismatch.jpg', 'products', 'image/jpeg')).rejects.toBeInstanceOf(BadRequestError);
    await expect(storageService.processAndStoreImage(Buffer.alloc(8 * 1024 * 1024 + 1), 'large.png', 'products', 'image/png'))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('uses the approved collection path only and rolls back objects from a partial upload', async () => {
    const file = await pngBuffer();
    await expect(storageService.processAndStoreImage(file, 'bad.png', '../products' as never, 'image/png'))
      .rejects.toMatchObject({ code: 'INVALID_MEDIA_COLLECTION' });
    state.failUploadAt = 2;
    await expect(storageService.processAndStoreImage(file, 'product.png', 'events', 'image/png'))
      .rejects.toMatchObject({ statusCode: 503, code: 'STORAGE_UNAVAILABLE' });
    expect(state.removed).toHaveLength(1);
    expect(state.removed[0]).toHaveLength(1);
  });

  it('deletes all variants only after every database reference check succeeds', async () => {
    const file = await pngBuffer();
    const upload = await storageService.processAndStoreImage(file, 'event.png', 'events', 'image/png');
    await expect(storageService.deleteImage(upload.w800)).resolves.toEqual({ deleted: true });
    expect(state.removed.at(-1)).toHaveLength(3);

    state.references.add(upload.w800);
    await expect(storageService.deleteImage(upload.w800)).rejects.toMatchObject({ code: 'IMAGE_IN_USE' });
    expect(state.removed).toHaveLength(1);

    state.referenceError = true;
    await expect(storageService.deleteImage(upload.w800)).rejects.toMatchObject({ statusCode: 503, code: 'STORAGE_UNAVAILABLE' });
    expect(state.removed).toHaveLength(1);
  });
});
