import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  parseQualityClassificationBackfillOptions,
  resolveClassificationPair,
} from './quality-classification-backfill';
import { QUALITY_CLASSIFICATION_SEEDS } from './quality-classification-bootstrap';

describe('quality classification backfill', () => {
  const pairs = new Map([
    [
      'INSPECTION_ISSUE_DEFECT\u0000制造缺陷\u0000焊接缺陷',
      { categoryId: 'category-1', subcategoryId: 'subcategory-1' },
    ],
  ]);

  it('resolves an exact category and subcategory pair', () => {
    expect(
      resolveClassificationPair(pairs, 'INSPECTION_ISSUE_DEFECT', {
        categoryId: null,
        categoryName: ' 制造缺陷 ',
        subcategoryId: null,
        subcategoryName: '焊接缺陷',
      }),
    ).toEqual({
      pair: { categoryId: 'category-1', subcategoryId: 'subcategory-1' },
      reason: null,
    });
  });

  it('does not overwrite a conflicting existing ID', () => {
    expect(
      resolveClassificationPair(pairs, 'INSPECTION_ISSUE_DEFECT', {
        categoryId: 'different-category',
        categoryName: '制造缺陷',
        subcategoryId: null,
        subcategoryName: '焊接缺陷',
      }),
    ).toEqual({
      pair: null,
      reason: 'existing_classification_id_conflict',
    });
  });

  it('reports missing and unknown names without guessing', () => {
    expect(
      resolveClassificationPair(pairs, 'INSPECTION_ISSUE_DEFECT', {
        categoryId: null,
        categoryName: null,
        subcategoryId: null,
        subcategoryName: null,
      }).reason,
    ).toBe('missing_classification_names');
    expect(
      resolveClassificationPair(pairs, 'INSPECTION_ISSUE_DEFECT', {
        categoryId: null,
        categoryName: '未知分类',
        subcategoryId: null,
        subcategoryName: '未知二级分类',
      }).reason,
    ).toBe('classification_pair_not_found');
  });

  it('parses apply mode and validates batch size', () => {
    expect(
      parseQualityClassificationBackfillOptions([
        '--apply',
        '--batch-size=500',
      ]),
    ).toEqual({ batchSize: 500, mode: 'apply' });
    expect(() =>
      parseQualityClassificationBackfillOptions(['--batch-size=0']),
    ).toThrow('--batch-size must be an integer between 1 and 1000');
  });

  it('keeps seed codes unique within each scope and preserves vehicle identity', () => {
    const keys = QUALITY_CLASSIFICATION_SEEDS.map(
      (seed) => `${seed.scope}:${seed.code}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      QUALITY_CLASSIFICATION_SEEDS.every(
        (seed) => seed.subcategories.length > 0,
      ),
    ).toBe(true);
    expect(QUALITY_CLASSIFICATION_SEEDS).toContainEqual(
      expect.objectContaining({
        code: 'VEHICLE_PRODUCT',
        name: '车辆产品',
        scope: 'AFTER_SALES_PRODUCT',
      }),
    );
  });

  it('keeps release bootstrap isolated from runtime module barrels', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'quality-classification-bootstrap.ts',
      ),
      'utf8',
    );

    expect(source).toContain(
      "from '~/modules/quality-classification/quality-classification-identities'",
    );
    expect(source).not.toContain("from '~/modules/quality-classification'");
  });
});
