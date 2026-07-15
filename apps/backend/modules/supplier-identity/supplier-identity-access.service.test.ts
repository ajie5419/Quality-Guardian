import { describe, expect, it } from 'vitest';

import { SupplierIdentityAccessService } from './supplier-identity-access.service';

describe('supplier identity access service', () => {
  it('allows system administrators', () => {
    expect(() =>
      SupplierIdentityAccessService.ensureAdmin({
        id: 'admin-1',
        realName: 'Administrator',
        roles: ['admin'],
        username: 'admin',
      }),
    ).not.toThrow();
  });

  it('rejects regular authenticated users', () => {
    expect(() =>
      SupplierIdentityAccessService.ensureAdmin({
        id: 'user-1',
        realName: 'Quality Engineer',
        roles: ['quality-engineer'],
        username: 'quality-engineer',
      }),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', httpStatus: 403 }));
  });
});
