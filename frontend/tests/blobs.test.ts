import { describe, expect, it } from 'vitest';
import { BLOB_PRESETS, generateBlobPath } from '../src/lib/blobs';

describe('blob shape utilities', () => {
  it('provides eight closed preset paths', () => {
    expect(Object.keys(BLOB_PRESETS)).toHaveLength(8);
    for (const path of Object.values(BLOB_PRESETS)) {
      expect(path).toMatch(/^M .+ Z$/);
    }
  });

  it('generates deterministic closed curves with 6–9 points', () => {
    const first = generateBlobPath(42, 7, 0.25);
    expect(generateBlobPath(42, 7, 0.25)).toBe(first);
    expect(generateBlobPath(43, 7, 0.25)).not.toBe(first);
    expect((first.match(/C /g) ?? []).length).toBe(7);
    expect(first).toMatch(/ Z$/);

    expect((generateBlobPath(42, 2).match(/C /g) ?? []).length).toBe(6);
    expect((generateBlobPath(42, 12).match(/C /g) ?? []).length).toBe(9);
  });
});
