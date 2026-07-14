import { describe, expect, it } from 'vitest';

import { getFormSchema } from './formData';

describe('inspection record form schema', () => {
  it('binds incoming suppliers by canonical id', () => {
    const supplierField = getFormSchema('incoming').find(
      (field) => field.fieldName === 'supplierId',
    );

    expect(supplierField).toEqual(
      expect.objectContaining({
        component: 'SupplierSelect',
        label: '单位',
        modelPropName: 'value',
        rules: 'required',
      }),
    );
    expect(
      getFormSchema('incoming').some(
        (field) => field.fieldName === 'supplierName',
      ),
    ).toBe(false);
  });
});
