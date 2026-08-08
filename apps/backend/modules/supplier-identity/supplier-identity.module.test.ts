import { describe, expect, it } from 'vitest';

import { supplierIdentityModule } from './supplier-identity.module';

describe('supplier identity module declaration', () => {
  it('declares the system settings page and its management permission', () => {
    expect(supplierIdentityModule.menus).toEqual([
      expect.objectContaining({
        authCode: 'System:SupplierIdentity:List',
        component: 'system/supplier-identity-links/index',
        path: '/system/supplier-identity-links',
      }),
    ]);
    expect(supplierIdentityModule.menus?.[0]?.buttons).toEqual([
      expect.objectContaining({ authCode: 'System:SupplierIdentity:Edit' }),
    ]);
  });
});
