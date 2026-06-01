import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '~/modules/rbac/rbac.service';
import prisma from '~/utils/prisma';

vi.mock('~/modules/rbac/rbac-config', () => ({
  isDataScopeV2Enabled: () => false,
  isRbacReadV2Enabled: () => true,
  isRbacSuperMergeAllCodesEnabled: () => true,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    menus: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
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
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
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
    (prisma.menus.findFirst as any).mockResolvedValue(null);
    (prisma.menus.create as any).mockResolvedValue({ id: 'created-menu' });
  });

  it('should write role permissions only to v2 relations', async () => {
    (prisma.rbac_permissions.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'perm-1' }, { id: 'perm-2' }]);

    await RbacService.saveRolePermissions('role-1', ['A:List', 'B:List']);

    expect(prisma.roles.update).not.toHaveBeenCalled();
    expect(prisma.rbac_role_permissions.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalled();
  });

  it('should create roles without legacy JSON permissions', async () => {
    (prisma.roles.create as any).mockResolvedValue({
      id: 'role-1',
      name: 'operator',
    });
    (prisma.rbac_permissions.findMany as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await RbacService.createRole({
      name: 'operator',
      permissions: ['QMS:Inspection:List'],
    });

    expect(prisma.roles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ permissions: expect.anything() }),
      }),
    );
  });

  it('should list role permissions from v2 relations', async () => {
    (prisma.roles.findMany as any).mockResolvedValue([
      {
        id: 'role-1',
        name: 'operator',
        description: 'Operator',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        rbac_role_permissions: [
          { permission: { code: 'QMS:Inspection:List' } },
          { permission: { code: 'QMS:Inspection:Create' } },
        ],
      },
    ]);
    (prisma.roles.count as any).mockResolvedValue(1);

    const result = await RbacService.listRoles(1, 10);

    expect(result.items[0].permissions).toEqual([
      'QMS:Inspection:List',
      'QMS:Inspection:Create',
    ]);
  });

  it('should merge all menu auth codes for super role', async () => {
    (prisma.users.findFirst as any).mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'super' },
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

  it('should keep button permissions under parent menu when ids are mixed types', async () => {
    (prisma.menus.findMany as any).mockResolvedValue([
      {
        id: 40,
        parentId: '0',
        type: 'catalog',
        authCode: null,
        meta: JSON.stringify({ title: '检验管理' }),
      },
      {
        id: '43',
        parentId: 40,
        type: 'menu',
        authCode: 'QMS:Inspection:Requests:List',
        meta: JSON.stringify({ title: '报检任务' }),
      },
      {
        id: 4301,
        parentId: '43',
        type: 'button',
        authCode: 'QMS:Inspection:Requests:Dispatch',
        meta: JSON.stringify({ title: '派单' }),
      },
    ]);

    const tree = await RbacService.getRolePermissionTree();

    expect(tree).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({
            key: 'QMS:Inspection:Requests:List',
            children: [
              expect.objectContaining({
                key: 'QMS:Inspection:Requests:Dispatch',
                title: '[按钮] 派单',
                type: 'button',
              }),
            ],
          }),
        ],
      }),
    ]);
  });

  it('should keep inspection dashboard and request permissions as unique tree keys', async () => {
    (prisma.menus.findMany as any).mockResolvedValue([
      {
        id: 40,
        parentId: '0',
        type: 'catalog',
        authCode: null,
        meta: JSON.stringify({ title: '检验管理' }),
      },
      {
        id: 'inspection-dashboard',
        parentId: 40,
        type: 'menu',
        authCode: 'QMS:Inspection:Dashboard:List',
        meta: JSON.stringify({ title: '报检看板' }),
      },
      {
        id: '43',
        parentId: 40,
        type: 'menu',
        authCode: 'QMS:Inspection:Requests:List',
        meta: JSON.stringify({ title: '报检任务' }),
      },
      {
        id: 4301,
        parentId: '43',
        type: 'button',
        authCode: 'QMS:Inspection:Requests:Dispatch',
        meta: JSON.stringify({ title: '派单' }),
      },
    ]);

    const tree = await RbacService.getRolePermissionTree();
    const inspectionChildren = tree[0]?.children ?? [];
    const keys = inspectionChildren.map((node) => node.key);

    expect(keys).toContain('QMS:Inspection:Dashboard:List');
    expect(keys).toContain('QMS:Inspection:Requests:List');
    expect(new Set(keys).size).toBe(keys.length);
    expect(
      inspectionChildren.find(
        (node) => node.key === 'QMS:Inspection:Requests:List',
      )?.children,
    ).toEqual([
      expect.objectContaining({
        key: 'QMS:Inspection:Requests:Dispatch',
        title: '[按钮] 派单',
        type: 'button',
      }),
    ]);
  });

  it('should not fallback to legacy JSON permissions', async () => {
    (prisma.users.findFirst as any).mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'operator' },
    });
    (prisma.rbac_user_roles.findMany as any).mockResolvedValue([]);
    (prisma.rbac_role_permissions.findMany as any).mockResolvedValue([]);

    const codes = await RbacService.getUserPermissionCodes('u1');

    expect(codes).toEqual([]);
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
