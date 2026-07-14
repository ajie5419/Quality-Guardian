import { describe, expect, it } from 'vitest';

import { parseAfterSalesListQuery } from './after-sales-query';

describe('after-sales list query', () => {
  it('preserves the canonical supplier ID filter', () => {
    expect(
      parseAfterSalesListQuery({
        supplierBrand: 'Legacy Supplier Name',
        supplierBrandId: ' supplier-1 ',
      }),
    ).toMatchObject({
      supplierBrand: 'Legacy Supplier Name',
      supplierBrandId: 'supplier-1',
    });
  });
});
