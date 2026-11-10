import { describe, expect, it } from 'vitest';
import { sanitizeValue } from '../../src/middleware/sanitize.js';
import { buildPaginationMeta, parsePagination } from '../../src/utils/pagination.js';

describe('sanitizeValue (NoSQL injection guard)', () => {
  it('strips $ operators and dotted keys recursively', () => {
    const payload = {
      email: 'aanya@example.com',
      $where: 'sleep(1000)',
      'nested.field': 'bad',
      filter: {
        $ne: null,
        validKey: 'ok',
      },
      items: [{ $gt: 0, title: 'Jacket' }],
    };

    expect(sanitizeValue(payload)).toEqual({
      email: 'aanya@example.com',
      filter: { validKey: 'ok' },
      items: [{ title: 'Jacket' }],
    });
  });

  it('drops prototype pollution keys', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"name":"safe"}');
    const clean = sanitizeValue(malicious);

    expect(Object.prototype.hasOwnProperty.call(clean, '__proto__')).toBe(false);
    expect(clean.name).toBe('safe');
  });
});

describe('pagination utilities', () => {
  it('clamps invalid page and excessive limit safely', () => {
    expect(parsePagination({ page: '-3', limit: '9999' })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
  });

  it('calculates skip and totalPages accurately', () => {
    const parsed = parsePagination({ page: '3', limit: '20' });
    expect(parsed).toEqual({ page: 3, limit: 20, skip: 40 });
    expect(buildPaginationMeta(parsed.page, parsed.limit, 55)).toEqual({
      page: 3,
      limit: 20,
      total: 55,
      totalPages: 3,
      hasNext: false,
    });
  });
});

