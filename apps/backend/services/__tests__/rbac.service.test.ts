import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { RbacService } from '../rbac.service';

vi.mock('../../utils/rbac-config', () => ({
  isDataScopeV2Enabled: () => false,
  isRbacReadV2Enabled: () => true,
  isRbacSuperMergeAllCodesEnabled: () => true,
}));

vi.mock('../../utils/prisma', () => ({
  default: {
    menus: {
      findMany: vi.fn(),
    },
    rbac_permissions: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    rbac_role_permissions: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    rbac_user_roles: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    roles: {
      update: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: Promise<any>[]) => Promise.all(ops)),
  },
}));

describe('rbacService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should dual-write role permissions to legacy JSON and v2 relations', async () => {
    (prisma.rbac_permissions.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'perm-1' }, { id: 'perm-2' }]);

    await RbacService.saveRolePermissions('role-1', ['A:List', 'B:List']);

    expect(prisma.roles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { permissions: JSON.stringify(['A:List', 'B:List']) },
        where: { id: 'role-1' },
      }),
    );
    expect(prisma.rbac_role_permissions.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalled();
  });

  it('should merge all menu auth codes for super role', async () => {
    (prisma.users.findFirst as any).mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'super', permissions: '["A:Legacy"]' },
    });
    (prisma.rbac_user_roles.findMany as any).mockResolvedValue([]);
    (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([
      { permission: { code: 'A:Legacy' } },
    ]);
    (prisma.menus.findMany as any).mockResolvedValue([
      { authCode: 'QMS:VehicleCommissioning:List' },
      { authCode: 'QMS:Inspection:List' },
    ]);

    const codes = await RbacService.getUserPermissionCodes('u1');
    expect(codes).toContain('A:Legacy');
    expect(codes).toContain('QMS:VehicleCommissioning:List');
    expect(codes).toContain('QMS:Inspection:List');
  });

  it('should dual-write user roles to both legacy and v2', async () => {
    await RbacService.saveUserRoles('u1', ['r1', 'r2']);

    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { roleId: 'r1' },
    });
    expect(prisma.rbac_user_roles.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(prisma.rbac_user_roles.createMany).toHaveBeenCalled();
  });
});
