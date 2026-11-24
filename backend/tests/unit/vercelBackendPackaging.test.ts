import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel backend packaging', () => {
  it('bundles the Express source entry point as ESM instead of flattening the TypeScript build output', () => {
    const config = JSON.parse(readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8'));
    const backend = config.services.backend;
    const backendRoot = new URL(`../../../${backend.root}/`, import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('package.json', backendRoot), 'utf8'));

    // Vercel's backends builder treats "." as source bundling, even when dist exists.
    expect(backend).toMatchObject({
      framework: 'express',
      entrypoint: 'src/server.ts',
      outputDirectory: '.',
    });
    expect(manifest.type).toBe('module');
    expect(config.rewrites).toContainEqual({
      source: '/api/(.*)',
      destination: { service: 'backend' },
    });
  });
});
