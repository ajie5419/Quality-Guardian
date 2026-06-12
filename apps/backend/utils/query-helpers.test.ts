import { describe, expect, it } from 'vitest';

import { buildKeywordOr, parsePagination } from './query-helpers';

describe('query helpers', () => {
  describe('buildKeywordOr', () => {
    it.each([[''], [null], [undefined], ['   ']])(
      'returns undefined for empty keyword %s',
      (keyword) => {
        expect(buildKeywordOr(keyword, ['name'] as const)).toBeUndefined();
      },
    );

    it('returns undefined for empty fields', () => {
      expect(buildKeywordOr('pump', [] as const)).toBeUndefined();
    });

    it('builds a single-field OR condition with trimmed contains value', () => {
      expect(buildKeywordOr('  pump  ', ['name'] as const)).toEqual({
        OR: [{ name: { contains: 'pump' } }],
      });
    });

    it('builds multi-field OR conditions in field order', () => {
      const result = buildKeywordOr('  pump  ', [
        'name',
        'contact',
        'email',
      ] as const);

      expect(result).toEqual({
        OR: [
          { name: { contains: 'pump' } },
          { contact: { contains: 'pump' } },
          { email: { contains: 'pump' } },
        ],
      });
      expect(result?.OR).toHaveLength(3);
      expect(result?.OR.map((item) => Object.keys(item)[0])).toEqual([
        'name',
        'contact',
        'email',
      ]);
    });
  });

  describe('parsePagination', () => {
    it('clamps zero and negative values to minimum one', () => {
      expect(parsePagination({ page: 0, pageSize: 0 })).toMatchObject({
        page: 1,
        pageSize: 1,
        skip: 0,
        take: 1,
      });
      expect(parsePagination({ page: -3, pageSize: -5 })).toMatchObject({
        page: 1,
        pageSize: 1,
        skip: 0,
        take: 1,
      });
    });

    it('defaults non-finite values and caps pageSize at 100', () => {
      expect(parsePagination({ page: 'abc', pageSize: 'xyz' })).toMatchObject({
        page: 1,
        pageSize: 20,
        skip: 0,
        take: 20,
      });
      expect(parsePagination({ page: 2, pageSize: 500 })).toMatchObject({
        page: 2,
        pageSize: 100,
        skip: 100,
        take: 100,
      });
    });
  });
});
