import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillRolePagePermissions,
  parseRolePagePermissionBackfillMode,
} from './role-page-permission-backfill';

vi.mock('~/utils/prisma', () => ({
  default: {
    menus: { findMany: vi.fn() },
    rbac_permissions: { upsert: vi.fn() },
    rbac_role_permissions: { createMany: vi.fn() },
    roles: { findMany: vi.fn() },
  },
}));

vi.mock('~/utils/module-loader', () => ({
  ensureModuleMenus: vi.fn(),
}));

vi.mock('~/utils/redis', () => ({
  redis: { delByPattern: vi.fn() },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: vi.fn(() => 'test-cuid'),
}));

const menus = [
  {
    authCode: 'QMS:Inspection:Issues:List',
    id: 'issues',
    parentId: 'qms',
    type: 'menu',
  },
  {
    authCode: 'QMS:Inspection:Issues:Edit',
    id: 'issues-edit',
    parentId: 'issues',
    type: 'button',
  },
  {
    authCode: 'System:User:List',
    id: 'users',
    parentId: 'system',
    type: 'menu',
  },
  {
    authCode: 'System:User:Edit',
    id: 'users-edit',
    parentId: 'users',
    type: 'button',
  },
];

function role(id: string, codes: string[]) {
  return {
    id,
    rbac_role_permissions: codes.map((code) => ({ permission: { code } })),
  };
}

describe('role page permission backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.menus.findMany).mockResolvedValue(menus as never);
  });

  it('plans missing page permissions across modules without mutating', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('role-issues', ['QMS:Inspection:Issues:Edit']),
      role('role-users', ['System:User:Edit']),
      role('role-compliant', ['System:User:List', 'System:User:Edit']),
    ] as never);

    const result = await backfillRolePagePermissions('dry-run');

    expect(result).toEqual({
      alreadyGrantedRoleCount: 1,
      candidateRoleCount: 3,
      createdRolePermissionCount: 0,
      mode: 'dry-run',
      pendingRoleCount: 2,
      pendingRolePermissionCount: 2,
      scannedRoleCount: 3,
    });
    expect(prisma.rbac_permissions.upsert).not.toHaveBeenCalled();
    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
    expect(ensureModuleMenus).not.toHaveBeenCalled();
  });

  it('adds each missing page relation and clears cached menus', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('role-1', ['QMS:Inspection:Issues:Edit', 'System:User:Edit']),
    ] as never);
    vi.mocked(prisma.rbac_permissions.upsert)
      .mockResolvedValueOnce({ id: 'issues-list' } as never)
      .mockResolvedValueOnce({ id: 'users-list' } as never);
    vi.mocked(prisma.rbac_role_permissions.createMany).mockResolvedValue({
      count: 2,
    });

    const result = await backfillRolePagePermissions('apply');

    expect(result.createdRolePermissionCount).toBe(2);
    expect(ensureModuleMenus).toHaveBeenCalledOnce();
    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          permissionId: 'issues-list',
          roleId: 'role-1',
        }),
        expect.objectContaining({
          permissionId: 'users-list',
          roleId: 'role-1',
        }),
      ],
      skipDuplicates: true,
    });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });

  it('is idempotent when every candidate role already has its pages', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('role-1', [
        'QMS:Inspection:Issues:List',
        'QMS:Inspection:Issues:Edit',
      ]),
    ] as never);

    const result = await backfillRolePagePermissions('apply');

    expect(result.pendingRoleCount).toBe(0);
    expect(result.createdRolePermissionCount).toBe(0);
    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
  });

  it('scans roles in bounded cursor batches', async () => {
    const firstBatch = Array.from({ length: 200 }, (_, index) =>
      role(`role-${String(index).padStart(3, '0')}`, []),
    );
    vi.mocked(prisma.roles.findMany)
      .mockResolvedValueOnce(firstBatch as never)
      .mockResolvedValueOnce([
        role('role-200', ['QMS:Inspection:Issues:Edit']),
      ] as never);

    const result = await backfillRolePagePermissions('dry-run');

    expect(result.scannedRoleCount).toBe(201);
    expect(result.pendingRoleCount).toBe(1);
    expect(prisma.roles.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'role-199' },
        skip: 1,
        take: 200,
      }),
    );
  });

  it('does nothing when no role owns a button permission', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('role-1', ['External:Permission']),
    ] as never);

    const result = await backfillRolePagePermissions('apply');

    expect(result.candidateRoleCount).toBe(0);
    expect(result.pendingRolePermissionCount).toBe(0);
    expect(prisma.rbac_permissions.upsert).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
  });

  it('parses apply and dry-run modes and rejects unknown arguments', () => {
    expect(parseRolePagePermissionBackfillMode([])).toBe('dry-run');
    expect(parseRolePagePermissionBackfillMode(['--apply'])).toBe('apply');
    expect(parseRolePagePermissionBackfillMode(['--dry-run'])).toBe('dry-run');
    expect(() => parseRolePagePermissionBackfillMode(['--unknown'])).toThrow(
      'unknown argument: --unknown',
    );
  });
});
