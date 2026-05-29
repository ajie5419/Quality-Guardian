import { describe, expect, it } from 'vitest';

import { buildKeywordOr } from './query-helpers';

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
});
