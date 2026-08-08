import { describe, expect, it } from 'vitest';

import { validateSupplierIdentityDraft } from './supplier-identity-form';

describe('supplier identity form validation', () => {
  it('normalizes canonical ids before submission', () => {
    expect(
      validateSupplierIdentityDraft({
        supplierId: ' supplier-1 ',
        teamId: ' team-1 ',
      }),
    ).toEqual({
      errors: {},
      value: { supplierId: 'supplier-1', teamId: 'team-1' },
    });
  });

  it('rejects an incomplete mapping before making an API request', () => {
    expect(
      validateSupplierIdentityDraft({ supplierId: '', teamId: 'team-1' }),
    ).toEqual({ errors: { supplierId: 'Select a supplier.' } });
  });
});
