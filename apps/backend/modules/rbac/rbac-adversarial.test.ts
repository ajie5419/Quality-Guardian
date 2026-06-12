/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import { RbacMenuService } from './rbac-menu.service';
import {
  parseStringArrayJson,
  RbacRoleService,
  uniqueNonEmpty,
} from './rbac-role.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
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
    data_permission_policies: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/redis', () => ({
  redis: { delByPattern: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

vi.mock('~/modules/rbac/rbac-config', () => ({
  isRbacReadV2Enabled: vi.fn(() => false),
  isRbacSuperMergeAllCodesEnabled: vi.fn(() => false),
}));

vi.mock('~/utils/module-loader', () => ({
  ensureModuleMenus: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  useResponseSuccess: vi.fn((data: unknown) => ({ code: 0, data })),
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'test-cuid-123',
}));

const mockPrisma = vi.mocked(prisma) as any;

// ═══════════════════════════════════════════════
// RBAC — Pure Helper Tests
// ═══════════════════════════════════════════════

describe('uniqueNonEmpty', () => {
  it('deduplicates and removes empty strings', () => {
    expect(uniqueNonEmpty(['a', 'b', 'a', '', 'b', '  '])).toEqual(['a', 'b']);
  });

  it('returns empty array for all-empty input', () => {
    expect(uniqueNonEmpty(['', '  ', ''])).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(uniqueNonEmpty([])).toEqual([]);
  });

  it('preserves single non-empty value', () => {
    expect(uniqueNonEmpty(['x'])).toEqual(['x']);
  });

  it('handles whitespace-only strings as empty', () => {
    expect(uniqueNonEmpty(['  ', '\t', '\n'])).toEqual([]);
  });
});

describe('parseStringArrayJson', () => {
  it('parses valid JSON array', () => {
    expect(parseStringArrayJson('["a","b"]')).toEqual(['a', 'b']);
  });

  it('returns empty array for null', () => {
    expect(parseStringArrayJson(null)).toEqual([]);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseStringArrayJson('{"key":"val"}')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseStringArrayJson('not-json')).toEqual([]);
  });

  it('filters out non-string values from mixed array', () => {
    expect(parseStringArrayJson('[1, "a", true, "b"]')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseStringArrayJson('[]')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// RBAC Role Service — CRUD Tests
// ═══════════════════════════════════════════════

describe('rbacRoleService.listRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.count.mockResolvedValue(0);
    mockPrisma.roles.findMany.mockResolvedValue([]);
  });

  it('returns paginated roles with correct skip/take', async () => {
    await RbacRoleService.listRoles(2, 10);
    expect(mockPrisma.roles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('returns empty items for empty DB', async () => {
    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('maps role permissions and sets name to description', async () => {
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date('2025-01-01'),
        description: '质检员',
        id: 'role-1',
        name: 'inspector',
        rbac_role_permissions: [
          { permission: { code: 'qms:view' } },
          { permission: { code: 'qms:edit' } },
        ],
        status: 1,
      },
    ] as never);
    mockPrisma.roles.count.mockResolvedValue(1);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].name).toBe('质检员');
    expect(result.items[0].value).toBe('inspector');
    expect(result.items[0].permissions).toEqual(['qms:view', 'qms:edit']);
  });

  it('deduplicates permission codes', async () => {
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        description: 'R',
        id: 'r-1',
        name: 'admin',
        rbac_role_permissions: [
          { permission: { code: 'a:x' } },
          { permission: { code: 'a:x' } },
          { permission: { code: 'b:y' } },
        ],
        status: 1,
      },
    ] as never);
    mockPrisma.roles.count.mockResolvedValue(1);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].permissions).toEqual(['a:x', 'b:y']);
  });

  it('filters out empty permission codes from null permission', async () => {
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        description: 'R',
        id: 'r-1',
        name: 'admin',
        rbac_role_permissions: [
          { permission: null },
          { permission: { code: '' } },
          { permission: { code: 'valid:code' } },
        ],
        status: 1,
      },
    ] as never);
    mockPrisma.roles.count.mockResolvedValue(1);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].permissions).toEqual(['valid:code']);
  });
});

describe('rbacRoleService.createRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.create.mockResolvedValue({
      createdAt: new Date(),
      description: 'test',
      id: 'role-new',
      name: 'new',
      status: 1,
    } as never);
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 0 });
  });

  it('creates role with correct defaults', async () => {
    const result = await RbacRoleService.createRole({
      name: 'tester',
      permissions: ['perm:a'],
    });
    expect(mockPrisma.roles.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isSystem: false,
          isDeleted: false,
          status: 1,
        }),
      }),
    );
    expect(result.permissions).toEqual(['perm:a']);
  });

  it('uses value as name when provided, falling back to name', async () => {
    await RbacRoleService.createRole({
      name: 'fallback',
      permissions: [],
      value: 'primary',
    });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.name).toBe('primary');
  });

  it('uses remark as description when provided', async () => {
    await RbacRoleService.createRole({
      description: 'desc1',
      name: 'n',
      permissions: [],
      remark: 'remark1',
    });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.description).toBe('remark1');
  });

  it('clears menu cache via redis', async () => {
    await RbacRoleService.createRole({ name: 'x', permissions: [] });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });
});

describe('rbacRoleService.updateRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.update.mockResolvedValue({ id: 'role-1' } as never);
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 0 });
  });

  it('updates role and syncs permissions', async () => {
    await RbacRoleService.updateRole('role-1', {
      name: 'updated-name',
      permissions: ['perm:a', 'perm:b'],
    });
    expect(mockPrisma.roles.update).toHaveBeenCalled();
    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalledWith({
      where: { roleId: 'role-1' },
    });
  });

  it('does not call saveRolePermissions when permissions is undefined', async () => {
    await RbacRoleService.updateRole('role-1', { name: 'n' });
    expect(mockPrisma.rbac_role_permissions.deleteMany).not.toHaveBeenCalled();
  });

  it('treats non-array permissions as empty', async () => {
    await RbacRoleService.updateRole('role-1', {
      permissions: null as unknown as string[],
    });
    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
  });
});

describe('rbacRoleService.softDeleteRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.update.mockResolvedValue({} as never);
  });

  it('soft-deletes role', async () => {
    await RbacRoleService.softDeleteRole('role-1');
    expect(mockPrisma.roles.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'role-1' },
        data: expect.objectContaining({ isDeleted: true }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════
// RBAC — Super Role Detection (multiple conditions)
// ═══════════════════════════════════════════════

describe('rbacRoleService.getUserPermissionCodes — super role detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when no roles found', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    const result = await RbacRoleService.getUserPermissionCodes('user-1');
    expect(result).toEqual([]);
  });

  it('detects super via role name containing "super"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      roles: { id: 'r-1', name: 'super_admin' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);
    const { isRbacSuperMergeAllCodesEnabled } = await import(
      '~/modules/rbac/rbac-config'
    );
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);
    mockPrisma.menus.findMany.mockResolvedValue([
      { authCode: 'menu:code1' },
      { authCode: 'menu:code2' },
    ] as never);

    const result = await RbacRoleService.getUserPermissionCodes('user-1');
    expect(result).toContain('menu:code1');
    expect(result).toContain('menu:code2');
  });

  it('detects super via role name containing "admin"', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      roles: { id: 'r-1', name: 'system_admin' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);
    mockPrisma.menus.findMany.mockResolvedValue([{ authCode: 'x' }] as never);

    const result = await RbacRoleService.getUserPermissionCodes('user-1');
    expect(result).toContain('x');
  });

  it('does not merge all codes when isSuperMergeAllCodesEnabled is false', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      roles: { id: 'r-1', name: 'super_user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: 'existing:perm' } },
    ] as never);

    const result = await RbacRoleService.getUserPermissionCodes('user-1');
    expect(result).toEqual(['existing:perm']);
  });
});

// ═══════════════════════════════════════════════
// RBAC — getUserRoles v1 vs v2 paths
// ═══════════════════════════════════════════════

describe('rbacRoleService.getUserRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when user not found', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    const result = await RbacRoleService.getUserRoles('nonexistent');
    expect(result).toEqual([]);
  });

  it('v1: returns roles from users.roles relation', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'inspector' },
    } as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([{ id: 'r1', name: 'inspector' }]);
  });

  it('v1: returns empty array when users.roles is null', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: null,
    } as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([]);
  });

  it('v2: returns roles from rbac_user_roles when available', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'old-role', name: 'old' },
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([
      { role: { id: 'r1', name: 'admin' } },
      { role: { id: 'r2', name: 'viewer' } },
    ] as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('v2: falls back to users.roles when rbac_user_roles is empty', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'fallback-role', name: 'fallback' },
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([]);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([{ id: 'fallback-role', name: 'fallback' }]);
  });

  it('v2: filters out null role links', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: null,
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([
      { role: { id: 'r1', name: 'a' } },
      { role: null },
    ] as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([{ id: 'r1', name: 'a' }]);
  });
});

// ═══════════════════════════════════════════════
// RBAC — saveRolePermissions
// ═══════════════════════════════════════════════

describe('rbacRoleService.saveRolePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates missing permissions and links them', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([]) // existing check
      .mockResolvedValueOnce([{ id: 'p-1' }]); // all permissions
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('role-1', ['new:perm']);

    expect(mockPrisma.rbac_permissions.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ code: 'new:perm', module: 'new' }),
        ]),
      }),
    );
  });

  it('skips permission creation when all codes exist', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([{ code: 'a:x', id: 'p-1' }])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('role-1', ['a:x']);

    expect(mockPrisma.rbac_permissions.createMany).not.toHaveBeenCalled();
  });

  it('handles empty codes array — only deletes, no createMany', async () => {
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });

    await RbacRoleService.saveRolePermissions('role-1', []);

    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
    expect(mockPrisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
  });

  it('extracts module from code prefix (e.g. qms:read → module=qms)', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('role-1', ['qms:read']);

    const createCall = mockPrisma.rbac_permissions.createMany.mock.calls[0][0];
    expect(createCall.data[0].module).toBe('qms');
  });
});

// ═══════════════════════════════════════════════
// RBAC — saveUserRoles
// ═══════════════════════════════════════════════

describe('rbacRoleService.saveUserRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing for empty roleIds', async () => {
    await RbacRoleService.saveUserRoles('u1', []);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
  });

  it('dual-writes: users.roleId and rbac_user_roles', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 2 });

    await RbacRoleService.saveUserRoles('u1', ['r1', 'r2']);

    expect(mockPrisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { roleId: 'r1' },
      }),
    );
    expect(mockPrisma.rbac_user_roles.createMany).toHaveBeenCalled();
  });

  it('deduplicates roleIds', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveUserRoles('u1', ['r1', 'r1', 'r1']);

    const createCall = mockPrisma.rbac_user_roles.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════
// RBAC — Data Scope
// ═══════════════════════════════════════════════

describe('rbacRoleService.getRoleDataScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns default SELF scope when no policy exists', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue(null);
    const result = await RbacRoleService.getRoleDataScope('r1', 'metrology');
    expect(result.scopeType).toBe('SELF');
    expect(result.deptIds).toEqual([]);
  });

  it('parses deptIds from JSON when policy exists', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: '["d1","d2"]',
      module: 'metrology',
      roleId: 'r1',
      scopeType: 'DEPT',
    } as never);

    const result = await RbacRoleService.getRoleDataScope('r1', 'metrology');
    expect(result.scopeType).toBe('DEPT');
    expect(result.deptIds).toEqual(['d1', 'd2']);
  });

  it('handles invalid JSON in deptIds gracefully', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: 'not-json',
      module: 'metrology',
      roleId: 'r1',
      scopeType: 'DEPT',
    } as never);

    const result = await RbacRoleService.getRoleDataScope('r1', 'metrology');
    expect(result.deptIds).toEqual([]);
  });
});

describe('rbacRoleService.saveRoleDataScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.data_permission_policies.upsert.mockResolvedValue({} as never);
  });

  it('upserts data scope with correct params', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'metrology', 'ALL', [
      'd1',
      'd2',
    ]);
    expect(mockPrisma.data_permission_policies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roleId_module: { roleId: 'r1', module: 'metrology' } },
        update: expect.objectContaining({ scopeType: 'ALL' }),
        create: expect.objectContaining({ scopeType: 'ALL' }),
      }),
    );
  });

  it('deduplicates deptIds before JSON serialization', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'm', 'DEPT', [
      'd1',
      'd1',
      'd2',
    ]);
    const createCall =
      mockPrisma.data_permission_policies.upsert.mock.calls[0][0];
    expect(JSON.parse(createCall.create.deptIds)).toEqual(['d1', 'd2']);
  });
});

// ═══════════════════════════════════════════════
// RBAC Menu Service — Tree Building
// ═══════════════════════════════════════════════

describe('rbacMenuService.getMenuTreeForUser — super detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue(undefined);
    vi.mocked(ensureModuleMenus).mockResolvedValue(undefined);
  });

  it('skips auth check for userId="1" (admin)', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: 'secret:menu',
        id: 'm1',
        meta: '{"title":"Secret"}',
        name: 'secret',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: '1',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: '1' });
    expect((result as any).code).toBe(0);
    expect((result as any).data).toBeDefined();
  });

  it('skips auth check for userId="USR-ADMIN"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: 'admin:only',
        id: 'm1',
        meta: '{"title":"Admin"}',
        name: 'admin',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'USR-ADMIN',
      roles: { id: 'r1', name: 'operator' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: 'USR-ADMIN',
    });
    expect((result as any).code).toBe(0);
  });

  it('skips auth check when permission contains "*"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: 'restricted',
        id: 'm1',
        meta: '{}',
        name: 'r',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-wildcard',
      roles: { id: 'r1', name: 'operator' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: '*' } },
    ] as never);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: 'u-wildcard',
    });
    expect((result as any).code).toBe(0);
  });

  it('returns cached result when redis has data', async () => {
    const { redis } = await import('~/utils/redis');
    vi.mocked(redis.get).mockResolvedValue({ code: 0, data: 'cached' });

    const result = await RbacMenuService.getMenuTreeForUser({ id: 'u-cached' });
    expect(result).toEqual({ code: 0, data: 'cached' });
    expect(mockPrisma.menus.findMany).not.toHaveBeenCalled();
  });
});

describe('rbacMenuService.getAllMenuTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds flat tree for single root menu', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{"title":"Root"}',
        name: 'root',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
    expect(result[0].children).toBeUndefined();
  });

  it('builds nested tree with children', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'parent',
        meta: '{"title":"Parent"}',
        name: 'parent',
        order: 1,
        parentId: '0',
        type: 'catalog',
      },
      {
        id: 'child',
        meta: '{"title":"Child"}',
        name: 'child',
        order: 1,
        parentId: 'parent',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].id).toBe('child');
  });

  it('handles mixed parentId types (number vs string)', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{"title":"Root"}',
        name: 'root',
        order: 1,
        parentId: 0,
        type: 'menu',
      },
      {
        id: 'm2',
        meta: '{"title":"Child"}',
        name: 'child',
        order: 1,
        parentId: 'm1',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
  });

  it('parses meta from JSON string', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{"title":"Parsed","icon":"icon-test"}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].meta).toEqual({ title: 'Parsed', icon: 'icon-test' });
  });

  it('returns empty object for invalid meta JSON', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: 'not-json',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].meta).toEqual({});
  });

  it('returns empty object for null meta', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: null,
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].meta).toEqual({});
  });

  it('sorts menus by order', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm2',
        meta: '{}',
        name: 'b',
        order: 2,
        parentId: '0',
        type: 'menu',
      },
      {
        id: 'm1',
        meta: '{}',
        name: 'a',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].id).toBe('m1');
    expect(result[1].id).toBe('m2');
  });
});

// ═══════════════════════════════════════════════
// RBAC Menu — CRUD
// ═══════════════════════════════════════════════

describe('rbacMenuService.createMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.menus.create.mockResolvedValue({ id: 'new-menu' } as never);
    vi.mocked(redis.delByPattern).mockResolvedValue(undefined);
  });

  it('creates menu with pid="0" default', async () => {
    await RbacMenuService.createMenu({ name: 'test' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('0');
  });

  it('creates menu with given pid', async () => {
    await RbacMenuService.createMenu({ name: 'child', pid: 'parent-1' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('parent-1');
  });

  it('treats pid="null" as root', async () => {
    await RbacMenuService.createMenu({ name: 'n', pid: 'null' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('0');
  });

  it('serializes meta to JSON string', async () => {
    await RbacMenuService.createMenu({
      meta: { title: 'Test', custom: true },
      name: 'n',
    });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    const meta = JSON.parse(call.data.meta);
    expect(meta.title).toBe('Test');
    expect(meta.custom).toBe(true);
  });

  it('clears menu cache', async () => {
    const { redis } = await import('~/utils/redis');
    await RbacMenuService.createMenu({ name: 'n' });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });
});

describe('rbacMenuService.updateMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.menus.update.mockResolvedValue({} as never);
    vi.mocked(redis.delByPattern).mockResolvedValue(undefined);
  });

  it('updates menu with correct id', async () => {
    await RbacMenuService.updateMenu('m1', { name: 'updated' });
    expect(mockPrisma.menus.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' } }),
    );
  });

  it('sets updatedAt to current time', async () => {
    const before = Date.now();
    await RbacMenuService.updateMenu('m1', { name: 'n' });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    const updatedAt = call.data.updatedAt as Date;
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('rbacMenuService.softDeleteMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.menus.update.mockResolvedValue({} as never);
    vi.mocked(redis.delByPattern).mockResolvedValue(undefined);
  });

  it('soft-deletes menu', async () => {
    await RbacMenuService.softDeleteMenu('m1');
    expect(mockPrisma.menus.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDeleted: true }),
      }),
    );
  });
});

describe('rbacMenuService.checkMenuNameExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns found menu', async () => {
    mockPrisma.menus.findFirst.mockResolvedValue({ id: 'm1' });
    const result = await RbacMenuService.checkMenuNameExists('test');
    expect(result).toEqual({ id: 'm1' });
  });

  it('returns null when not found', async () => {
    mockPrisma.menus.findFirst.mockResolvedValue(null);
    const result = await RbacMenuService.checkMenuNameExists('nonexistent');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// RBAC Menu — getRolePermissionTree
// ═══════════════════════════════════════════════

describe('rbacMenuService.getRolePermissionTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureModuleMenus).mockResolvedValue(undefined);
  });

  it('builds tree with type labels in title', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: null,
        id: 'm1',
        meta: '{"title":"Dashboard"}',
        name: 'dash',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
      {
        authCode: 'btn:add',
        id: 'm2',
        meta: '{"title":"Add"}',
        name: 'add',
        order: 1,
        parentId: 'm1',
        type: 'button',
      },
      {
        authCode: null,
        id: 'm3',
        meta: null,
        name: 'cat',
        order: 2,
        parentId: '0',
        type: 'catalog',
      },
    ] as never);

    const result = await RbacMenuService.getRolePermissionTree();
    expect(result[0].title).toContain('[页面]');
    expect(result[0].title).toContain('Dashboard');

    expect(result[0].children).toHaveLength(1);

    expect(result[0].children![0].title).toContain('[按钮]');
    expect(result[0].children![0].key).toBe('btn:add');
    expect(result[1].title).toContain('[目录]');
    expect(result[1].title).toContain('未命名');
  });

  it('uses MENU_<id> as key when authCode is null', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: null,
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getRolePermissionTree();
    expect(result[0].key).toBe('MENU_m1');
  });

  it('returns empty tree for empty menus', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([]);
    const result = await RbacMenuService.getRolePermissionTree();
    expect(result).toEqual([]);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Menu Tree Building
// ═══════════════════════════════════════════════

describe('rbacMenuService.getAllMenuTree — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles 3-level deep nesting', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'root',
        meta: '{}',
        name: 'root',
        order: 1,
        parentId: '0',
        type: 'catalog',
      },
      {
        id: 'mid',
        meta: '{}',
        name: 'mid',
        order: 1,
        parentId: 'root',
        type: 'menu',
      },
      {
        id: 'leaf',
        meta: '{}',
        name: 'leaf',
        order: 1,
        parentId: 'mid',
        type: 'button',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].children).toHaveLength(1);
    expect(result[0].children![0].children![0].id).toBe('leaf');
  });

  it('handles parentId=null as root', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: null,
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('m1');
  });

  it('handles parentId=undefined as root', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: undefined,
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
  });

  it('handles parentId=0 (number) as root', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      { id: 'm1', meta: '{}', name: 'n', order: 1, parentId: 0, type: 'menu' },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
  });

  it('handles parentId="0" (string) as root', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(1);
  });

  it('orphan menu (parentId points to non-existent) is excluded from tree', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'orphan',
        meta: '{}',
        name: 'orphan',
        order: 1,
        parentId: 'nonexistent',
        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result).toHaveLength(0);
  });

  it('sorts children by order within same parent', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'p',
        meta: '{}',
        name: 'p',
        order: 1,
        parentId: '0',
        type: 'catalog',
      },
      {
        id: 'c2',
        meta: '{}',
        name: 'c2',
        order: 2,
        parentId: 'p',
        type: 'menu',
      },
      {
        id: 'c1',
        meta: '{}',
        name: 'c1',
        order: 1,
        parentId: 'p',

        type: 'menu',
      },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].children![0].id).toBe('c1');
    expect(result[0].children![1].id).toBe('c2');
  });

  it('menus with order=undefined default to 0', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'c',
        meta: '{}',
        name: 'c',
        order: undefined,
        parentId: '0',
        type: 'menu',
      },
      { id: 'a', meta: '{}', name: 'a', order: 1, parentId: '0', type: 'menu' },
    ] as never);

    const result = await RbacMenuService.getAllMenuTree();
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('a');
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Menu Filtering
// ═══════════════════════════════════════════════

describe('rbacMenuService.getMenuTreeForUser — filtering adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue(undefined);
    vi.mocked(ensureModuleMenus).mockResolvedValue(undefined);
  });

  it('filters out button-type menus from user tree', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'p',
        meta: '{}',
        name: 'p',
        order: 1,
        parentId: '0',
        type: 'catalog',
        authCode: null,
      },
      {
        id: 'm',
        meta: '{}',
        name: 'm',
        order: 1,
        parentId: 'p',
        type: 'menu',
        authCode: 'QMS:X',
      },
      {
        id: 'b',
        meta: '{}',
        name: 'b',
        order: 1,
        parentId: 'm',
        type: 'button',
        authCode: 'QMS:X:Btn',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: '1',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: '1' });
    const tree = (result as any).data as any[];
    const catalog = tree[0];
    expect(catalog.children).toHaveLength(1);
    const menuItem = catalog.children[0];
    expect(menuItem.type).toBe('menu');
    expect(menuItem.authCode).toBe('QMS:X');
  });

  it('hides catalog with all children filtered out', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'cat',
        meta: '{}',
        name: 'cat',
        order: 1,
        parentId: '0',
        type: 'catalog',
        authCode: null,
      },
      {
        id: 'm',
        meta: '{}',
        name: 'm',
        order: 1,
        parentId: 'cat',
        type: 'menu',
        authCode: 'RESTRICTED:CODE',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-noaccess',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: 'u-noaccess',
    });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(0);
  });

  it('publicAccess meta makes menu visible without auth code', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'pub',
        meta: '{"publicAccess":true}',
        name: 'pub',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'SECRET:CODE',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-noperm',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: 'u-noperm' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('pub');
  });

  it('skipAuthCheck returns all non-button menus', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'RESTRICTED',
      },
      {
        id: 'm2',
        meta: '{}',
        name: 'm2',
        order: 2,
        parentId: '0',
        type: 'catalog',
        authCode: 'RESTRICTED',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: '1',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: '1' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(2);
  });

  it('caches result in redis with 24h TTL', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([]);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-cache',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    await RbacMenuService.getMenuTreeForUser({ id: 'u-cache' });
    expect(redis.set).toHaveBeenCalledWith(
      'qms:menu:u-cache',
      expect.anything(),
      3600 * 24,
    );
  });

  it('returns cached data when available', async () => {
    vi.mocked(redis.get).mockResolvedValue({
      code: 0,
      data: [{ id: 'cached' }],
    });
    const result = await RbacMenuService.getMenuTreeForUser({ id: 'u-cached' });
    expect((result as any).data).toEqual([{ id: 'cached' }]);
    expect(mockPrisma.menus.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Super Role Detection
// ═══════════════════════════════════════════════

describe('rbacMenuService.getMenuTreeForUser — super detection adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue(undefined);
    vi.mocked(ensureModuleMenus).mockResolvedValue(undefined);
  });

  it('detects super via role name "Super_Admin" (case-insensitive)', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'X',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-super',
      roles: { id: 'r1', name: 'Super_Admin' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: 'u-super' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
  });

  it('detects super via permission "*"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'X',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-wild',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: '*' } },
    ] as never);

    const result = await RbacMenuService.getMenuTreeForUser({ id: 'u-wild' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
  });

  it('detects super via permission \'["*"]\'', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'X',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u-json-wild',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: '["*"]' } },
    ] as never);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: 'u-json-wild',
    });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
  });

  it('detects super via userId "1"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'X',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: '1',
      roles: { id: 'r1', name: 'regular_user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: '1' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
  });

  it('detects super via userId "USR-ADMIN"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'X',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'USR-ADMIN',
      roles: { id: 'r1', name: 'regular_user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: 'USR-ADMIN',
    });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(1);
  });

  it('does NOT detect super for userId "2"', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([
      {
        id: 'm1',
        meta: '{}',
        name: 'm1',
        order: 1,
        parentId: '0',
        type: 'menu',
        authCode: 'RESTRICTED',
      },
    ] as never);
    mockPrisma.users.findFirst.mockResolvedValue({
      id: '2',
      roles: { id: 'r1', name: 'user' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({ id: '2' });
    const tree = (result as any).data as any[];
    expect(tree).toHaveLength(0);
  });

  it('uses userId fallback to userinfo.userId when id is null', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.menus.findMany.mockResolvedValue([]);
    mockPrisma.users.findFirst.mockResolvedValue(null);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const result = await RbacMenuService.getMenuTreeForUser({
      id: null,
      userId: 'fallback-id',
    });
    expect((result as any).code).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — getUserPermissionCodes
// ═══════════════════════════════════════════════

describe('rbacRoleService.getUserPermissionCodes — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when getUserRoles returns empty', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null);
    const codes = await RbacRoleService.getUserPermissionCodes('missing-user');
    expect(codes).toEqual([]);
  });

  it('non-super role does not trigger merge even with empty permissions', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'operator' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);

    const codes = await RbacRoleService.getUserPermissionCodes('u1');
    expect(codes).toEqual([]);
    expect(mockPrisma.menus.findMany).not.toHaveBeenCalled();
  });

  it('detects super via lowercase "super" in role name', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'superuser' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);
    mockPrisma.menus.findMany.mockResolvedValue([
      { authCode: 'ALL:CODES' },
    ] as never);

    const codes = await RbacRoleService.getUserPermissionCodes('u1');
    expect(codes).toContain('ALL:CODES');
  });

  it('detects super via "admin" substring in role name', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'admin_role' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([]);
    mockPrisma.menus.findMany.mockResolvedValue([
      { authCode: 'ADMIN:ALL' },
    ] as never);

    const codes = await RbacRoleService.getUserPermissionCodes('u1');
    expect(codes).toContain('ADMIN:ALL');
  });

  it('merges existing + menu codes for super role', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'super' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: 'existing:perm' } },
    ] as never);
    mockPrisma.menus.findMany.mockResolvedValue([
      { authCode: 'menu:code1' },
      { authCode: 'menu:code2' },
    ] as never);

    const codes = await RbacRoleService.getUserPermissionCodes('u1');
    expect(codes).toContain('existing:perm');
    expect(codes).toContain('menu:code1');
    expect(codes).toContain('menu:code2');
  });

  it('does not call menus.findMany when merge is disabled', async () => {
    const { isRbacReadV2Enabled, isRbacSuperMergeAllCodesEnabled } =
      await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);
    vi.mocked(isRbacSuperMergeAllCodesEnabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'super' },
    } as never);
    mockPrisma.rbac_role_permissions.findMany.mockResolvedValue([
      { permission: { code: 'only:perm' } },
    ] as never);

    const codes = await RbacRoleService.getUserPermissionCodes('u1');
    expect(codes).toEqual(['only:perm']);
    expect(mockPrisma.menus.findMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — getUserRoles
// ═══════════════════════════════════════════════

describe('rbacRoleService.getUserRoles — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('v1: wraps single legacy role in array', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(false);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'r1', name: 'single' },
    } as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([{ id: 'r1', name: 'single' }]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('v2: returns multiple roles from relation table', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'old', name: 'old' },
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([
      { role: { id: 'r1', name: 'admin' } },
      { role: { role: 'r2', name: 'viewer' } },
      { role: { id: 'r3', name: 'editor' } },
    ] as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toHaveLength(3);
  });

  it('v2: filters null roles from relation table', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: null,
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([
      { role: { id: 'r1', name: 'a' } },
      { role: null },
      { role: { id: 'r2', name: 'b' } },
    ] as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toHaveLength(2);
  });

  it('v2: falls back to legacy when all v2 roles are null', async () => {
    const { isRbacReadV2Enabled } = await import('~/modules/rbac/rbac-config');
    vi.mocked(isRbacReadV2Enabled).mockReturnValue(true);

    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'u1',
      roles: { id: 'legacy', name: 'legacy_role' },
    } as never);
    mockPrisma.rbac_user_roles.findMany.mockResolvedValue([
      { role: null },
      { role: null },
    ] as never);

    const result = await RbacRoleService.getUserRoles('u1');
    expect(result).toEqual([{ id: 'legacy', name: 'legacy_role' }]);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — listRoles
// ═══════════════════════════════════════════════

describe('rbacRoleService.listRoles — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles role with no permissions', async () => {
    mockPrisma.roles.count.mockResolvedValue(1);
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date('2025-01-01'),
        description: null,
        id: 'r-1',
        name: 'empty_role',
        rbac_role_permissions: [],
        status: 1,
      },
    ] as never);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].permissions).toEqual([]);
  });

  it('handles role with null permission links', async () => {
    mockPrisma.roles.count.mockResolvedValue(1);
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date('2025-01-01'),
        description: 'R',
        id: 'r-1',
        name: 'admin',
        rbac_role_permissions: [
          { permission: null },
          { permission: { code: null } },
        ],
        status: 1,
      },
    ] as never);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].permissions).toEqual([]);
  });

  it('uses description as name when available, falls back to name', async () => {
    mockPrisma.roles.count.mockResolvedValue(1);
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        description: '质检员角色',
        id: 'r-1',
        name: 'inspector',
        rbac_role_permissions: [],
        status: 1,
      },
    ] as never);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].name).toBe('质检员角色');
    expect(result.items[0].value).toBe('inspector');
    expect(result.items[0].remark).toBe('质检员角色');
  });

  it('formats createTime in zh-CN locale', async () => {
    mockPrisma.roles.count.mockResolvedValue(1);
    mockPrisma.roles.findMany.mockResolvedValue([
      {
        createdAt: new Date('2025-06-15T10:30:00Z'),
        description: 'R',
        id: 'r-1',
        name: 'admin',
        rbac_role_permissions: [],
        status: 1,
      },
    ] as never);

    const result = await RbacRoleService.listRoles(1, 20);
    expect(result.items[0].createTime).toBeTruthy();
    expect(typeof result.items[0].createTime).toBe('string');
  });

  it('pagination: page=2, pageSize=5 returns correct skip', async () => {
    mockPrisma.roles.count.mockResolvedValue(10);
    mockPrisma.roles.findMany.mockResolvedValue([]);

    await RbacRoleService.listRoles(2, 5);
    expect(mockPrisma.roles.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — saveRolePermissions
// ═══════════════════════════════════════════════

describe('rbacRoleService.saveRolePermissions — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates permissions for all missing codes', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([]) // existing check
      .mockResolvedValueOnce([{ id: 'p-1' }, { id: 'p-2' }]); // all
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 2 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 2 });

    await RbacRoleService.saveRolePermissions('r1', ['a:x', 'b:y']);

    expect(mockPrisma.rbac_permissions.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ code: 'a:x', module: 'a' }),
          expect.objectContaining({ code: 'b:y', module: 'b' }),
        ]),
      }),
    );
  });

  it('module extraction: empty code before : yields "QMS"', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('r1', [':edge']);

    const createCall = mockPrisma.rbac_permissions.createMany.mock.calls[0][0];
    expect(createCall.data[0].module).toBe('QMS');
  });

  it('module extraction: code without : yields full code as module', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('r1', ['nocolon']);

    const createCall = mockPrisma.rbac_permissions.createMany.mock.calls[0][0];
    expect(createCall.data[0].module).toBe('nocolon');
  });

  it('empty codes: skips createMany, only deletes existing relations', async () => {
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });

    await RbacRoleService.saveRolePermissions('r1', []);

    expect(mockPrisma.rbac_permissions.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
  });

  it('whitespace-only codes filtered out → treated as empty', async () => {
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });

    await RbacRoleService.saveRolePermissions('r1', ['  ', '\t']);

    expect(mockPrisma.rbac_permissions.createMany).not.toHaveBeenCalled();
  });

  it('transaction: deletes then creates in order', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('r1', ['new:perm']);

    const txCall = mockPrisma.$transaction.mock.calls[0][0];
    expect(txCall).toHaveLength(2);
  });

  it('uses skipDuplicates in createMany', async () => {
    mockPrisma.rbac_permissions.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'p-1' }]);
    mockPrisma.rbac_permissions.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveRolePermissions('r1', ['perm:a']);

    const permCreateCall =
      mockPrisma.rbac_permissions.createMany.mock.calls[0][0];
    expect(permCreateCall.skipDuplicates).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — saveUserRoles
// ═══════════════════════════════════════════════

describe('rbacRoleService.saveUserRoles — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('single role: sets that role as primary in users.roleId', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveUserRoles('u1', ['r1']);

    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { roleId: 'r1' },
    });
  });

  it('first role becomes primary even if not alphabetically first', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 3 });

    await RbacRoleService.saveUserRoles('u1', ['r3', 'r1', 'r2']);

    expect(mockPrisma.users.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { roleId: 'r3' },
    });
  });

  it('empty roleIds after dedup: early return, no DB calls', async () => {
    await RbacRoleService.saveUserRoles('u1', ['', '  ', '']);

    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(mockPrisma.rbac_user_roles.deleteMany).not.toHaveBeenCalled();
  });

  it('transaction: deletes existing then creates new', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 2 });

    await RbacRoleService.saveUserRoles('u1', ['r1', 'r2']);

    const txCall = mockPrisma.$transaction.mock.calls[0][0];
    expect(txCall).toHaveLength(2);
  });

  it('deduplicates roleIds before write', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveUserRoles('u1', ['r1', 'r1', 'r1']);

    const createCall = mockPrisma.rbac_user_roles.createMany.mock.calls[0][0];
    expect(createCall.data).toHaveLength(1);
  });

  it('uses skipDuplicates in createMany', async () => {
    mockPrisma.users.update.mockResolvedValue({} as never);
    mockPrisma.rbac_user_roles.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_user_roles.createMany.mockResolvedValue({ count: 1 });

    await RbacRoleService.saveUserRoles('u1', ['r1']);

    const createCall = mockPrisma.rbac_user_roles.createMany.mock.calls[0][0];
    expect(createCall.skipDuplicates).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — createRole / updateRole
// ═══════════════════════════════════════════════

describe('rbacRoleService.createRole — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.create.mockResolvedValue({
      createdAt: new Date(),
      id: 'role-new',
      name: 'new',
    } as never);
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 0 });
  });

  it('sets isSystem=false and isDeleted=false by default', async () => {
    await RbacRoleService.createRole({ name: 'test', permissions: [] });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.isSystem).toBe(false);
    expect(call.data.isDeleted).toBe(false);
  });

  it('uses name as description when no remark/description provided', async () => {
    await RbacRoleService.createRole({ name: 'tester', permissions: [] });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.description).toBe('tester');
  });

  it('uses remark as description, ignoring description', async () => {
    await RbacRoleService.createRole({
      description: 'ignored',
      name: 'n',
      permissions: [],
      remark: 'actual-remark',
    });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.description).toBe('actual-remark');
  });

  it('generates cuid-based id', async () => {
    await RbacRoleService.createRole({ name: 'test', permissions: [] });
    const call = mockPrisma.roles.create.mock.calls[0][0];
    expect(call.data.id).toContain('role-');
  });
});

describe('rbacRoleService.updateRole — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.roles.update.mockResolvedValue({ id: 'role-1' } as never);
    mockPrisma.rbac_permissions.findMany.mockResolvedValue([]);
    mockPrisma.rbac_role_permissions.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.rbac_role_permissions.createMany.mockResolvedValue({ count: 0 });
  });

  it('sets updatedAt on update', async () => {
    const before = Date.now();
    await RbacRoleService.updateRole('r1', { name: 'updated' });
    const call = mockPrisma.roles.update.mock.calls[0][0];
    expect((call.data.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it('does not call saveRolePermissions when permissions is undefined', async () => {
    await RbacRoleService.updateRole('r1', { name: 'n' });
    expect(mockPrisma.rbac_role_permissions.deleteMany).not.toHaveBeenCalled();
  });

  it('calls saveRolePermissions with empty array when permissions=[]', async () => {
    await RbacRoleService.updateRole('r1', { permissions: [] });
    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
  });

  it('calls saveRolePermissions when permissions is non-array', async () => {
    await RbacRoleService.updateRole('r1', {
      permissions: null as unknown as string[],
    });
    expect(mockPrisma.rbac_role_permissions.deleteMany).toHaveBeenCalled();
  });

  it('only updates name field when only value is provided', async () => {
    await RbacRoleService.updateRole('r1', { value: 'new_name' });
    const call = mockPrisma.roles.update.mock.calls[0][0];
    expect(call.data.name).toBe('new_name');
  });

  it('description priority: name > remark > description', async () => {
    await RbacRoleService.updateRole('r1', {
      description: 'desc',
      name: 'from-name',
      remark: 'remark',
    });
    const call = mockPrisma.roles.update.mock.calls[0][0];
    expect(call.data.description).toBe('from-name');
  });

  it('description priority: remark > description when name is absent', async () => {
    await RbacRoleService.updateRole('r1', {
      description: 'desc',
      remark: 'remark',
    });
    const call = mockPrisma.roles.update.mock.calls[0][0];
    expect(call.data.description).toBe('remark');
  });

  it('clears menu cache on update', async () => {
    await RbacRoleService.updateRole('r1', { name: 'n' });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Data Scope
// ═══════════════════════════════════════════════

describe('rbacRoleService.getRoleDataScope — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SELF when policy is null', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue(null);
    const result = await RbacRoleService.getRoleDataScope('r1', 'module');
    expect(result.scopeType).toBe('SELF');
    expect(result.deptIds).toEqual([]);
  });

  it('parses valid JSON deptIds', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: '["d1","d2","d3"]',
      module: 'm',
      scopeType: 'DEPT',
    } as never);
    const result = await RbacRoleService.getRoleDataScope('r1', 'm');
    expect(result.deptIds).toEqual(['d1', 'd2', 'd3']);
  });

  it('handles invalid JSON deptIds gracefully', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: '{invalid',
      module: 'm',
      scopeType: 'DEPT',
    } as never);
    const result = await RbacRoleService.getRoleDataScope('r1', 'm');
    expect(result.deptIds).toEqual([]);
  });

  it('handles null deptIds in policy', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: null,
      module: 'm',
      scopeType: 'ALL',
    } as never);
    const result = await RbacRoleService.getRoleDataScope('r1', 'm');
    expect(result.deptIds).toEqual([]);
  });

  it('handles empty array JSON deptIds', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: '[]',
      module: 'm',
      scopeType: 'DEPT',
    } as never);
    const result = await RbacRoleService.getRoleDataScope('r1', 'm');
    expect(result.deptIds).toEqual([]);
  });

  it('filters non-string values from deptIds JSON', async () => {
    mockPrisma.data_permission_policies.findFirst.mockResolvedValue({
      deptIds: '[1, "d1", true, "d2"]',
      module: 'm',
      scopeType: 'DEPT',
    } as never);
    const result = await RbacRoleService.getRoleDataScope('r1', 'm');
    expect(result.deptIds).toEqual(['d1', 'd2']);
  });
});

describe('rbacRoleService.saveRoleDataScope — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.data_permission_policies.upsert.mockResolvedValue({} as never);
  });

  it('creates new policy when none exists', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'm', 'ALL');
    expect(mockPrisma.data_permission_policies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roleId_module: { roleId: 'r1', module: 'm' } },
      }),
    );
  });

  it('sets isDeleted=false on update', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'm', 'SELF');
    const call = mockPrisma.data_permission_policies.upsert.mock.calls[0][0];
    expect(call.update.isDeleted).toBe(false);
    expect(call.create.isDeleted).toBe(false);
  });

  it('deduplicates deptIds', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'm', 'DEPT', [
      'd1',
      'd1',
      'd2',
    ]);
    const call = mockPrisma.data_permission_policies.upsert.mock.calls[0][0];
    expect(JSON.parse(call.create.deptIds)).toEqual(['d1', 'd2']);
  });

  it('filters empty strings from deptIds', async () => {
    await RbacRoleService.saveRoleDataScope('r1', 'm', 'DEPT', [
      'd1',
      '',
      '  ',
      'd2',
    ]);
    const call = mockPrisma.data_permission_policies.upsert.mock.calls[0][0];
    expect(JSON.parse(call.create.deptIds)).toEqual(['d1', 'd2']);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — createMenu / updateMenu
// ═══════════════════════════════════════════════

describe('rbacMenuService.createMenu — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.menus.create.mockResolvedValue({ id: 'new-menu' } as never);
    vi.mocked(redis.delByPattern).mockResolvedValue(undefined);
  });

  it('generates cuid-based id', async () => {
    await RbacMenuService.createMenu({ name: 'test' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.id).toMatch(/^menu-/);
  });

  it('defaults status to 1', async () => {
    await RbacMenuService.createMenu({ name: 'test' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.status).toBe(1);
  });

  it('respects explicit status', async () => {
    await RbacMenuService.createMenu({ name: 'test', status: 0 });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.status).toBe(0);
  });

  it('defaults order to 0 when orderNo not provided', async () => {
    await RbacMenuService.createMenu({ name: 'test' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.order).toBe(0);
  });

  it('uses meta.orderNo when orderNo not provided', async () => {
    await RbacMenuService.createMenu({
      meta: { orderNo: 5 },
      name: 'test',
    });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.order).toBe(5);
  });

  it('sets isDeleted=false', async () => {
    await RbacMenuService.createMenu({ name: 'test' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.isDeleted).toBe(false);
  });

  it('pid="null" treated as root (parentId="0")', async () => {
    await RbacMenuService.createMenu({ name: 'test', pid: 'null' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('0');
  });

  it('pid="" treated as root (parentId="0")', async () => {
    await RbacMenuService.createMenu({ name: 'test', pid: '' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('0');
  });

  it('pid="0" treated as root', async () => {
    await RbacMenuService.createMenu({ name: 'test', pid: '0' });
    const call = mockPrisma.menus.create.mock.calls[0][0];
    expect(call.data.parentId).toBe('0');
  });
});

describe('rbacMenuService.updateMenu — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.menus.update.mockResolvedValue({} as never);
    vi.mocked(redis.delByPattern).mockResolvedValue(undefined);
  });

  it('only updates provided fields', async () => {
    await RbacMenuService.updateMenu('m1', { name: 'new-name' });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    expect(call.data.name).toBe('new-name');
    expect(call.data.component).toBeUndefined();
  });

  it('updates status when provided', async () => {
    await RbacMenuService.updateMenu('m1', { status: 0 });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    expect(call.data.status).toBe(0);
  });

  it('does not set status when undefined', async () => {
    await RbacMenuService.updateMenu('m1', { name: 'n' });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    expect(call.data.status).toBeUndefined();
  });

  it('updates order when orderNo provided', async () => {
    await RbacMenuService.updateMenu('m1', { orderNo: 10 });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    expect(call.data.order).toBe(10);
  });

  it('serializes meta with title and icon', async () => {
    await RbacMenuService.updateMenu('m1', {
      icon: 'icon-test',
      title: 'New Title',
    });
    const call = mockPrisma.menus.update.mock.calls[0][0];
    const meta = JSON.parse(call.data.meta);
    expect(meta.title).toBe('New Title');
    expect(meta.icon).toBe('icon-test');
  });

  it('clears cache on update', async () => {
    await RbacMenuService.updateMenu('m1', { name: 'n' });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — getRolePermissionTree
// ═══════════════════════════════════════════════

describe('rbacMenuService.getRolePermissionTree — deep adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureModuleMenus).mockResolvedValue(undefined);
  });

  it('handles mixed parentId types (number vs string)', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: null,
        id: 40,
        meta: '{}',
        name: 'cat',
        order: 1,
        parentId: '0',
        type: 'catalog',
      },
      {
        authCode: 'perm:x',
        id: '43',
        meta: '{}',
        name: 'menu',
        order: 1,
        parentId: 40,
        type: 'menu',
      },
      {
        authCode: 'btn:y',
        id: 4301,
        meta: '{}',
        name: 'btn',
        order: 1,
        parentId: '43',

        type: 'button',
      },
    ] as never);

    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].children).toHaveLength(1);
  });

  it('returns empty array for empty menus', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([]);
    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree).toEqual([]);
  });

  it('handles menus with no children', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: 'perm:x',
        id: 'm1',
        meta: '{"title":"Test"}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toBeUndefined();
  });

  it('key uses authCode when present', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: 'QMS:X:List',
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree[0].key).toBe('QMS:X:List');
  });

  it('key uses MENU_<id> when authCode is empty string', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: '',
        id: 'm1',
        meta: '{}',
        name: 'n',
        order: 1,
        parentId: '0',
        type: 'menu',
      },
    ] as never);

    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree[0].key).toBe('MENU_m1');
  });

  it('handles deeply nested menus in permission tree', async () => {
    mockPrisma.menus.findMany.mockResolvedValue([
      {
        authCode: null,
        id: 'l1',
        meta: '{}',
        name: 'l1',
        order: 1,
        parentId: '0',
        type: 'catalog',
      },
      {
        authCode: null,
        id: 'l2',
        meta: '{}',
        name: 'l2',
        order: 1,
        parentId: 'l1',
        type: 'catalog',
      },
      {
        authCode: 'deep:perm',
        id: 'l3',
        meta: '{}',

        name: 'l3',

        order: 1,
        parentId: 'l2',
        type: 'menu',
      },
    ] as never);

    const tree = await RbacMenuService.getRolePermissionTree();
    expect(tree[0].children![0].children).toHaveLength(1);
    expect(tree[0].children![0].children![0].key).toBe('deep:perm');
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — uniqueNonEmpty
// ═══════════════════════════════════════════════

describe('uniqueNonEmpty — deep adversarial', () => {
  it('preserves case-sensitive uniqueness', () => {
    expect(uniqueNonEmpty(['A', 'a', 'B'])).toEqual(['A', 'a', 'B']);
  });

  it('handles non-standard whitespace (zero-width space NOT caught by trim)', () => {
    expect(uniqueNonEmpty(['\u200B', 'x'])).toEqual(['\u200B', 'x']);
  });

  it('handles very long strings', () => {
    const long = 'x'.repeat(10_000);
    expect(uniqueNonEmpty([long, long])).toEqual([long]);
  });

  it('handles single element', () => {
    expect(uniqueNonEmpty(['only'])).toEqual(['only']);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — parseStringArrayJson
// ═══════════════════════════════════════════════

describe('parseStringArrayJson — deep adversarial', () => {
  it('handles nested arrays (flattened to strings)', () => {
    expect(parseStringArrayJson('[["a","b"]]')).toEqual([]);
  });

  it('handles empty string input', () => {
    expect(parseStringArrayJson('')).toEqual([]);
  });

  it('handles whitespace-only string', () => {
    expect(parseStringArrayJson('   ')).toEqual([]);
  });

  it('handles deeply nested object', () => {
    expect(parseStringArrayJson('{"a":{"b":"c"}}')).toEqual([]);
  });

  it('handles number input', () => {
    expect(parseStringArrayJson('42' as unknown as null)).toEqual([]);
  });

  it('parses large array', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    expect(parseStringArrayJson(JSON.stringify(arr))).toHaveLength(1000);
  });
});
