import { describe, expect, it } from 'vitest';

import { getIssueSearchFormSchema } from './data';

describe('inspection issue search schema', () => {
  it('provides a supplier and outsourcing unit search field', () => {
    const supplierField = getIssueSearchFormSchema().find(
      (field) => field.fieldName === 'supplierName',
    );

    expect(supplierField).toEqual(
      expect.objectContaining({
        component: 'Input',
        fieldName: 'supplierName',
      }),
    );
  });
});
