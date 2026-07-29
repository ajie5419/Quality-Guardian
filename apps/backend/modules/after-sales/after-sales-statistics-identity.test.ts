import { describe, expect, it } from 'vitest';

import {
  getAfterSalesStatisticsIdentityKey,
  getAfterSalesStatisticsSnapshotFields,
  resolveAfterSalesStatisticsIdentity,
} from './after-sales-statistics-identity';

describe('after-sales statistics identity', () => {
  it('preserves both classification levels as unresolved evidence', () => {
    const identity = resolveAfterSalesStatisticsIdentity('productSubtype', {
      productSubtype: 'Vehicle OBU',
      productType: 'On-board product',
    });

    expect(identity).toEqual({
      id: null,
      rawName: 'On-board product / Vehicle OBU',
    });
    expect(getAfterSalesStatisticsIdentityKey(identity!)).toBe(
      'missing:MISSING_REQUIRED:On-board product / Vehicle OBU',
    );
    expect(getAfterSalesStatisticsSnapshotFields('productSubtype')).toEqual([
      'productType',
      'productSubtype',
    ]);
  });

  it('distinguishes an optional supplier from a broken supplier identity', () => {
    expect(resolveAfterSalesStatisticsIdentity('supplierBrand', {})).toEqual({
      id: null,
      missingName: '未关联供应商',
      rawName: null,
      resolutionReason: 'NOT_APPLICABLE',
    });
    expect(
      resolveAfterSalesStatisticsIdentity('supplierBrand', {
        supplierBrand: 'Legacy supplier',
      }),
    ).toEqual({
      id: null,
      missingName: undefined,
      rawName: 'Legacy supplier',
      resolutionReason: 'MISSING_REQUIRED',
    });
  });
});
