import { describe, expect, it } from 'vitest';

import { resolveCanonicalClassificationName } from './classification-resolver';

describe('resolveCanonicalClassificationName', () => {
  it('prefers the current master-data name over the historical snapshot', () => {
    expect(
      resolveCanonicalClassificationName('工艺缺陷-测试', '工艺缺陷'),
    ).toBe('工艺缺陷-测试');
  });

  it('falls back to the snapshot when the current name is missing', () => {
    expect(resolveCanonicalClassificationName(null, '工艺缺陷')).toBe(
      '工艺缺陷',
    );
    expect(resolveCanonicalClassificationName('', '工艺缺陷')).toBe('工艺缺陷');
    expect(resolveCanonicalClassificationName(undefined, '工艺缺陷')).toBe(
      '工艺缺陷',
    );
  });

  it('trims whitespace on both inputs', () => {
    expect(resolveCanonicalClassificationName(' 工艺缺陷 ', '')).toBe(
      '工艺缺陷',
    );
    expect(resolveCanonicalClassificationName('', ' 工艺缺陷 ')).toBe(
      '工艺缺陷',
    );
  });

  it('returns an empty string when both names are missing', () => {
    expect(resolveCanonicalClassificationName(null, null)).toBe('');
    expect(resolveCanonicalClassificationName(undefined, '')).toBe('');
  });
});
