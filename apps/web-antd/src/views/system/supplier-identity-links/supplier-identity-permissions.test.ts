import { describe, expect, it } from 'vitest';

import {
  canManageSupplierIdentity,
  canViewSupplierIdentity,
} from './supplier-identity-permissions';

describe('supplier identity page permissions', () => {
  it('matches the backend system-admin role semantics', () => {
    const user = { roles: ['system-admin'] };
    expect(
      canViewSupplierIdentity(['System:SupplierIdentity:List'], user),
    ).toBe(true);
    expect(
      canManageSupplierIdentity(['System:SupplierIdentity:Edit'], user),
    ).toBe(true);
  });

  it('matches super-role and code wildcard menu access', () => {
    const user = { roles: ['super'] };
    expect(canViewSupplierIdentity([], user)).toBe(true);
    expect(canManageSupplierIdentity([], user)).toBe(true);
    expect(canViewSupplierIdentity(['*'], { roles: ['admin'] })).toBe(true);
    expect(canManageSupplierIdentity(['["*"]'], user)).toBe(true);
  });

  it('does not expose mappings to non-admin users with matching codes', () => {
    const user = { roles: ['quality-manager'] };
    expect(
      canViewSupplierIdentity(['System:SupplierIdentity:List'], user),
    ).toBe(false);
    expect(
      canManageSupplierIdentity(['System:SupplierIdentity:Edit'], user),
    ).toBe(false);
  });
});
