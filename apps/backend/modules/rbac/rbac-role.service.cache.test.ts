import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPermissionCodesCache,
  RbacRoleService,
} from '~/modules/rbac/rbac-role.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    roles: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
    rbac_user_roles: { findMany: vi.fn() },
    rbac_role_permissions: { findMany: vi.fn() },
    menus: { findMany: vi.fn() },
    rbac_permissions: { findMany: vi.fn(), createMany: vi.fn() },
  },
}));

vi.mock('~/modules/rbac/rbac-config', () => ({
  isRbacReadV2Enabled: () => false,
  isRbacSuperMergeAllCodesEnabled: () => true,
}));

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
