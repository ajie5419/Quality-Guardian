import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { DataScopeService } from '../data-scope.service';

vi.mock('../../utils/rbac-config', () => ({
  isDataScopeV2Enabled: () => true,
}));

vi.mock('../../utils/prisma', () => ({
  default: {
    data_permission_policies: {
      findMany: vi.fn(),
    },
    departments: {
      findMany: vi.fn(),
    },
    rbac_user_roles: {
      findMany: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
  },
}));

describe('dataScopeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.departments.findMany as any).mockResolvedValue([]);
    (prisma.users.findFirst as any).mockResolvedValue({ roleId: 'role-1' });
    (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
      { roleId: 'role-1' },
    ]);
  });

  it('should keep query unchanged for ALL', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'ALL', deptIds: null },
    ]);

    const where = await DataScopeService.buildInspectionWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual({ isDeleted: false });
  });

  it('should inject department filter for DEPT', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'DEPT', deptIds: '["dept-a","dept-b"]' },
    ]);

    const where = await DataScopeService.buildInspectionWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.any(Array),
      }),
    );
  });

  it('should fallback to SELF with username condition', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([]);

    const where = await DataScopeService.buildSupplierWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual({
      AND: [{ isDeleted: false }, { buyer: 'vben' }],
    });
  });
});
