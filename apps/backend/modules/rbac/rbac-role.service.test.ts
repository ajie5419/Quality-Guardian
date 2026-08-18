import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPermissionCodesCache,
  RbacRoleService,
} from '~/modules/rbac/rbac-role.service';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

vi.mock('~/utils/prisma', () => {
  const client = {
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
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    data_permission_policies: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    menus: {
      findMany: vi.fn(),
    },
  };
  return {
    default: {
      ...client,
      $transaction: vi.fn((input: unknown) =>
        typeof input === 'function'
          ? input(client)
          : Promise.all(input as Promise<unknown>[]),
      ),
    },
  };
});

vi.mock('~/utils/redis', () => ({
  redis: {
    delByPattern: vi.fn(),
  },
}));

vi.mock('~/modules/rbac/rbac-config', () => ({
  isRbacReadV2Enabled: () => true,
  isRbacSuperMergeAllCodesEnabled: () => true,
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid',
}));

describe('rbacRoleService', () => {
  beforeEach(() => {
    clearPermissionCodesCache();
    vi.clearAllMocks();
    vi.mocked(prisma.menus.findMany).mockResolvedValue([
      {
        authCode: 'QMS:Test:List',
        id: 'qms-test-list',
        parentId: 'qms',
        type: 'menu',
      },
    ] as never);
  });

  describe('listRoles', () => {
    it('should list roles with permissions', async () => {
      (prisma.roles.count as any).mockResolvedValue(1);
      (prisma.roles.findMany as any).mockResolvedValue([
        {
          id: 'r1',
          name: 'operator',
          description: 'Operator',
          createdAt: new Date('2026-01-01'),
          rbac_role_permissions: [{ permission: { code: 'QMS:Test:List' } }],
        },
      ]);

      const result = await RbacRoleService.listRoles(1, 10);

      expect(result.total).toBe(1);
      expect(result.items[0].permissions).toEqual(['QMS:Test:List']);
      expect(result.items[0].name).toBe('Operator');
      expect(result.items[0].value).toBe('operator');
    });

    it('should return empty list when no roles exist', async () => {
      (prisma.roles.count as any).mockResolvedValue(0);
      (prisma.roles.findMany as any).mockResolvedValue([]);

      const result = await RbacRoleService.listRoles(1, 10);

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('should deduplicate permission codes', async () => {
      (prisma.roles.count as any).mockResolvedValue(1);
      (prisma.roles.findMany as any).mockResolvedValue([
        {
          id: 'r1',
          name: 'operator',
          description: 'Operator',
          createdAt: new Date('2026-01-01'),
          rbac_role_permissions: [
            { permission: { code: 'QMS:Test:List' } },
            { permission: { code: 'QMS:Test:List' } },
            { permission: { code: '' } },
          ],
        },
      ]);

      const result = await RbacRoleService.listRoles(1, 10);

      expect(result.items[0].permissions).toEqual(['QMS:Test:List']);
    });
  });

  describe('createRole', () => {
    it('should create role with permissions', async () => {
      (prisma.roles.create as any).mockResolvedValue({
        id: 'r1',
        name: 'operator',
      });
      (prisma.rbac_permissions.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'perm-1' }]);

      const result = await RbacRoleService.createRole({
        name: 'operator',
        permissions: ['QMS:Test:List'],
      });

      expect(result.name).toBe('operator');
      expect(prisma.roles.create).toHaveBeenCalled();
      expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
    });

    it('should create role without permissions', async () => {
      (prisma.roles.create as any).mockResolvedValue({
        id: 'r1',
        name: 'readonly',
      });
      (prisma.rbac_permissions.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await RbacRoleService.createRole({
        name: 'readonly',
      });

      expect(result.permissions).toEqual([]);
    });

    it('does not create a role when the permission hierarchy is invalid', async () => {
      vi.mocked(prisma.menus.findMany).mockResolvedValue([
        {
          authCode: 'QMS:Inspection:Issues:List',
          id: 'issues',
          parentId: 'inspection',
          type: 'menu',
        },
        {
          authCode: 'QMS:Inspection:Issues:Edit',
          id: 'issues-edit',
          parentId: 'issues',
          type: 'button',
        },
      ] as never);

      await expect(
        RbacRoleService.createRole({
          name: 'operator',
          permissions: ['QMS:Inspection:Issues:Edit'],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PERMISSION_HIERARCHY' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.roles.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('should update role and permissions', async () => {
      (prisma.roles.update as any).mockResolvedValue({ id: 'r1' });
      (prisma.rbac_permissions.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'perm-1' }]);

      await RbacRoleService.updateRole('r1', {
        name: 'Updated',
        permissions: ['QMS:Test:List'],
      });

      expect(prisma.roles.update).toHaveBeenCalled();
      expect(redis.delByPattern).toHaveBeenCalled();
    });

    it('should update role without changing permissions when undefined', async () => {
      (prisma.roles.update as any).mockResolvedValue({ id: 'r1' });

      await RbacRoleService.updateRole('r1', {
        name: 'Updated',
      });

      expect(prisma.roles.update).toHaveBeenCalled();
    });

    it('does not update a role when the permission code is undeclared', async () => {
      await expect(
        RbacRoleService.updateRole('r1', {
          permissions: ['Unknown:Permission'],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PERMISSION_CODE' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.roles.update).not.toHaveBeenCalled();
    });

    it('rejects malformed permissions instead of clearing the role', async () => {
      await expect(
        RbacRoleService.updateRole('r1', { permissions: null }),
      ).rejects.toMatchObject({ code: 'INVALID_ROLE_INPUT', httpStatus: 400 });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.rbac_role_permissions.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('softDeleteRole', () => {
    it('should soft delete role', async () => {
      (prisma.roles.update as any).mockResolvedValue({});

      await RbacRoleService.softDeleteRole('r1');

      expect(prisma.roles.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
      expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
    });
  });

  describe('getUserRoles', () => {
    it('should return roles from v2 relation table', async () => {
      (prisma.users.findFirst as any).mockResolvedValue({
        id: 'u1',
        roles: { id: 'old-r1', name: 'old_role' },
      });
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
        { role: { id: 'r1', name: 'operator' } },
      ]);

      const result = await RbacRoleService.getUserRoles('u1');

      expect(result).toEqual([{ id: 'r1', name: 'operator' }]);
    });

    it('should return empty when user not found', async () => {
      (prisma.users.findFirst as any).mockResolvedValue(null);

      const result = await RbacRoleService.getUserRoles('missing');

      expect(result).toEqual([]);
    });

    it('should fallback to legacy role when v2 returns empty', async () => {
      (prisma.users.findFirst as any).mockResolvedValue({
        id: 'u1',
        roles: { id: 'r1', name: 'legacy_role' },
      });
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([]);

      const result = await RbacRoleService.getUserRoles('u1');

      expect(result).toEqual([{ id: 'r1', name: 'legacy_role' }]);
    });
  });

  describe('getUserPermissionCodes', () => {
    it('should return codes from role permissions', async () => {
      (prisma.users.findFirst as any).mockResolvedValue({
        id: 'u1',
        roles: { id: 'r1', name: 'operator' },
      });
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
        { role: { id: 'r1', name: 'operator' } },
      ]);
      (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([
        { permission: { code: 'QMS:Test:List' } },
      ]);

      const codes = await RbacRoleService.getUserPermissionCodes('u1');

      expect(codes).toContain('QMS:Test:List');
    });

    it('should merge all menu codes for super role', async () => {
      (prisma.users.findFirst as any).mockResolvedValue({
        id: 'u1',
        roles: { id: 'r1', name: 'super_admin' },
      });
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
        { role: { id: 'r1', name: 'super_admin' } },
      ]);
      (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([]);
      (prisma.menus.findMany as any).mockResolvedValue([
        { authCode: 'QMS:All:List' },
      ]);

      const codes = await RbacRoleService.getUserPermissionCodes('u1');

      expect(codes).toContain('QMS:All:List');
    });

    it('should return empty when user has no roles', async () => {
      (prisma.users.findFirst as any).mockResolvedValue(null);

      const codes = await RbacRoleService.getUserPermissionCodes('u1');

      expect(codes).toEqual([]);
    });
  });

  describe('getUserIdsByPermissionCode', () => {
    it('returns users linked to roles with the requested permission', async () => {
      (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([
        { roleId: 'role-dispatch' },
      ]);
      (prisma.roles.findMany as any).mockResolvedValue([]);
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
        { userId: 'user-1' },
      ]);
      (prisma.users.findMany as any).mockResolvedValue([{ id: 'user-2' }]);

      const userIds = await RbacRoleService.getUserIdsByPermissionCode(
        'QMS:Inspection:Requests:Dispatch',
      );

      expect(userIds).toEqual(['user-1', 'user-2']);
    });

    it('includes active super/admin roles as dispatch receivers', async () => {
      (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([]);
      (prisma.roles.findMany as any).mockResolvedValue([
        { id: 'role-super', name: 'Super Admin' },
        { id: 'role-user', name: 'operator' },
      ]);
      (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
        { userId: 'user-super' },
      ]);
      (prisma.users.findMany as any).mockResolvedValue([]);

      const userIds = await RbacRoleService.getUserIdsByPermissionCode(
        'QMS:Inspection:Requests:Dispatch',
      );

      expect(userIds).toEqual(['user-super']);
      expect(prisma.rbac_user_roles.findMany).toHaveBeenCalledWith({
        where: { roleId: { in: ['role-super'] } },
        select: { userId: true },
      });
    });
  });

  describe('saveRolePermissions', () => {
    it('should create missing permissions and save relations', async () => {
      (prisma.rbac_permissions.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'perm-1' }]);

      await RbacRoleService.saveRolePermissions('r1', ['QMS:Test:List']);

      expect(prisma.rbac_permissions.createMany).toHaveBeenCalled();
      expect(prisma.rbac_role_permissions.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
      });
      expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalled();
    });

    it('should skip createMany when codes are empty', async () => {
      (prisma.rbac_permissions.findMany as any).mockResolvedValue([]);

      await RbacRoleService.saveRolePermissions('r1', []);

      expect(prisma.rbac_role_permissions.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'r1' },
      });
      expect(prisma.rbac_permissions.createMany).not.toHaveBeenCalled();
    });

    it('should filter out empty strings from codes', async () => {
      (prisma.rbac_permissions.findMany as any)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'perm-1' }]);

      await RbacRoleService.saveRolePermissions('r1', [
        'QMS:Test:List',
        '',
        '  ',
      ]);

      expect(prisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
    });

    it('rejects button permissions without the owning page permission', async () => {
      vi.mocked(prisma.menus.findMany).mockResolvedValue([
        {
          authCode: 'QMS:Inspection:Issues:List',
          id: 'issues',
          parentId: 'inspection',
          type: 'menu',
        },
        {
          authCode: 'QMS:Inspection:Issues:Edit',
          id: 'issues-edit',
          parentId: 'issues',
          type: 'button',
        },
      ] as never);

      await expect(
        RbacRoleService.saveRolePermissions('r1', [
          'QMS:Inspection:Issues:Edit',
        ]),
      ).rejects.toMatchObject({
        code: 'INVALID_PERMISSION_HIERARCHY',
        httpStatus: 400,
      });
      expect(prisma.rbac_role_permissions.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects synthetic catalog placeholder permissions', async () => {
      await expect(
        RbacRoleService.saveRolePermissions('r1', ['MENU_catalog']),
      ).rejects.toMatchObject({
        code: 'INVALID_PERMISSION_CODE',
        httpStatus: 400,
      });
      expect(prisma.menus.findMany).not.toHaveBeenCalled();
      expect(prisma.rbac_role_permissions.deleteMany).not.toHaveBeenCalled();
    });

    it('saves independent page and button permissions without sibling grants', async () => {
      vi.mocked(prisma.menus.findMany).mockResolvedValue([
        {
          authCode: 'QMS:Inspection:Issues:List',
          id: 'issues',
          parentId: 'inspection',
          type: 'menu',
        },
        {
          authCode: 'QMS:Inspection:Issues:View',
          id: 'issues-view',
          parentId: 'issues',
          type: 'button',
        },
        {
          authCode: 'QMS:Inspection:Issues:Edit',
          id: 'issues-edit',
          parentId: 'issues',
          type: 'button',
        },
      ] as never);
      vi.mocked(prisma.rbac_permissions.findMany)
        .mockResolvedValueOnce([
          { code: 'QMS:Inspection:Issues:List', id: 'list' },
          { code: 'QMS:Inspection:Issues:View', id: 'view' },
        ] as never)
        .mockResolvedValueOnce([{ id: 'list' }, { id: 'view' }] as never);

      await RbacRoleService.saveRolePermissions('r1', [
        'QMS:Inspection:Issues:List',
        'QMS:Inspection:Issues:View',
      ]);

      expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ permissionId: 'list', roleId: 'r1' }),
          expect.objectContaining({ permissionId: 'view', roleId: 'r1' }),
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('saveUserRoles', () => {
    it('should dual-write to users.roleId and rbac_user_roles', async () => {
      await RbacRoleService.saveUserRoles('u1', ['r1', 'r2']);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { roleId: 'r1' },
      });
      expect(prisma.rbac_user_roles.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.rbac_user_roles.createMany).toHaveBeenCalled();
    });

    it('should skip when roleIds is empty', async () => {
      await RbacRoleService.saveUserRoles('u1', []);

      expect(prisma.users.update).not.toHaveBeenCalled();
    });

    it('should deduplicate roleIds', async () => {
      await RbacRoleService.saveUserRoles('u1', ['r1', 'r1']);

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { roleId: 'r1' },
      });
    });
  });

  describe('getRoleDataScope', () => {
    it('should return data scope for role and module', async () => {
      (prisma.data_permission_policies.findFirst as any).mockResolvedValue({
        scopeType: 'DEPT',
        deptIds: JSON.stringify(['d1', 'd2']),
      });

      const result = await RbacRoleService.getRoleDataScope('r1', 'inspection');

      expect(result).toEqual({
        deptIds: ['d1', 'd2'],
        module: 'inspection',
        roleId: 'r1',
        scopeType: 'DEPT',
      });
    });

    it('should return SELF scope when no policy exists', async () => {
      (prisma.data_permission_policies.findFirst as any).mockResolvedValue(
        null,
      );

      const result = await RbacRoleService.getRoleDataScope('r1', 'inspection');

      expect(result).toEqual({
        deptIds: [],
        module: 'inspection',
        roleId: 'r1',
        scopeType: 'SELF',
      });
    });
  });

  describe('saveRoleDataScope', () => {
    it('should upsert data scope policy', async () => {
      (prisma.data_permission_policies.upsert as any).mockResolvedValue({});

      await RbacRoleService.saveRoleDataScope('r1', 'inspection', 'DEPT', [
        'd1',
        'd2',
      ]);

      expect(prisma.data_permission_policies.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { roleId_module: { roleId: 'r1', module: 'inspection' } },
        }),
      );
    });

    it('should handle empty deptIds', async () => {
      (prisma.data_permission_policies.upsert as any).mockResolvedValue({});

      await RbacRoleService.saveRoleDataScope('r1', 'inspection', 'ALL');

      expect(prisma.data_permission_policies.upsert).toHaveBeenCalled();
    });
  });
});

describe('rbacRoleService permission code cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPermissionCodesCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches permission codes within the TTL window', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-1',
      roleId: 'role-1',
      roles: { id: 'role-1', name: 'user' },
    } as never);
    vi.mocked(prisma.roles.findFirst).mockResolvedValue({
      id: 'role-1',
      name: 'user',
    } as never);
    vi.mocked(prisma.rbac_role_permissions.findMany).mockResolvedValue([
      { permission: { code: 'QMS:Test:A' } },
    ] as never);

    const first = await RbacRoleService.getUserPermissionCodes('user-1');
    const second = await RbacRoleService.getUserPermissionCodes('user-1');

    expect(first).toEqual(['QMS:Test:A']);
    expect(second).toEqual(['QMS:Test:A']);
    expect(prisma.rbac_role_permissions.findMany).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the TTL expires', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-1',
      roleId: 'role-1',
      roles: { id: 'role-1', name: 'user' },
    } as never);
    vi.mocked(prisma.roles.findFirst).mockResolvedValue({
      id: 'role-1',
      name: 'user',
    } as never);
    vi.mocked(prisma.rbac_role_permissions.findMany).mockResolvedValue([
      { permission: { code: 'QMS:Test:A' } },
    ] as never);

    await RbacRoleService.getUserPermissionCodes('user-1');
    vi.advanceTimersByTime(61_000);
    await RbacRoleService.getUserPermissionCodes('user-1');

    expect(prisma.rbac_role_permissions.findMany).toHaveBeenCalledTimes(2);
  });

  it('invalidates the cache on permission persistence', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-1',
      roleId: 'role-1',
      roles: { id: 'role-1', name: 'user' },
    } as never);
    vi.mocked(prisma.roles.findFirst).mockResolvedValue({
      id: 'role-1',
      name: 'user',
    } as never);
    vi.mocked(prisma.rbac_role_permissions.findMany).mockResolvedValue([
      { permission: { code: 'QMS:Test:A' } },
    ] as never);

    await RbacRoleService.getUserPermissionCodes('user-1');
    clearPermissionCodesCache();
    await RbacRoleService.getUserPermissionCodes('user-1');

    expect(prisma.rbac_role_permissions.findMany).toHaveBeenCalledTimes(2);
  });
});
