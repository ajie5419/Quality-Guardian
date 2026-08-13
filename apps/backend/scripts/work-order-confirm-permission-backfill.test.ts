import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

import {
  backfillWorkOrderConfirmPermission,
  parseWorkOrderConfirmPermissionBackfillMode,
} from './work-order-confirm-permission-backfill';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(async (callback) => callback(prisma)),
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

function role(id: string, name: string, codes: string[]) {
  return {
    id,
    name,
    rbac_role_permissions: codes.map((code) => ({ permission: { code } })),
  };
}

function getBackendRoot() {
  const cwd = process.cwd();
  return basename(cwd) === 'backend' && basename(dirname(cwd)) === 'apps'
    ? cwd
    : resolve(cwd, 'apps/backend');
}

describe('work order confirm permission backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans QC grants without mutating in dry-run mode', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('qc-1', 'QC', ['QMS:WorkOrder:Confirm']),
      role('qc-2', 'QC', ['QMS:WorkOrder:List', 'QMS:WorkOrder:Confirm']),
      role('editor-1', 'planner', ['QMS:WorkOrder:Edit']),
    ] as never);

    await expect(
      backfillWorkOrderConfirmPermission('dry-run'),
    ).resolves.toEqual({
      alreadyGrantedRoleCount: 1,
      candidateRoleCount: 3,
      createdRolePermissionCount: 0,
      mode: 'dry-run',
      pendingRoleCount: 2,
    });
    expect(ensureModuleMenus).not.toHaveBeenCalled();
    expect(prisma.rbac_permissions.upsert).not.toHaveBeenCalled();
    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
  });

  it('synchronizes the confirm menu before granting active QC roles', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('qc-1', 'QC', []),
    ] as never);
    vi.mocked(prisma.rbac_permissions.upsert)
      .mockResolvedValueOnce({ id: 'list-permission' } as never)
      .mockResolvedValueOnce({ id: 'confirm-permission' } as never);
    vi.mocked(prisma.rbac_role_permissions.createMany).mockResolvedValue({
      count: 2,
    });

    await expect(backfillWorkOrderConfirmPermission('apply')).resolves.toEqual({
      alreadyGrantedRoleCount: 0,
      candidateRoleCount: 1,
      createdRolePermissionCount: 2,
      mode: 'apply',
      pendingRoleCount: 1,
    });
    expect(ensureModuleMenus).toHaveBeenCalledOnce();
    expect(prisma.roles.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        status: 1,
        OR: [
          { name: 'QC' },
          {
            rbac_role_permissions: {
              some: {
                permission: {
                  code: 'QMS:WorkOrder:Edit',
                  isDeleted: false,
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        rbac_role_permissions: {
          where: {
            permission: {
              code: {
                in: [
                  'QMS:WorkOrder:List',
                  'QMS:WorkOrder:Confirm',
                  'QMS:WorkOrder:Edit',
                ],
              },
              isDeleted: false,
            },
          },
          select: { permission: { select: { code: true } } },
        },
      },
    });
    expect(prisma.rbac_permissions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.rbac_permissions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'QMS:WorkOrder:List' } }),
    );
    expect(prisma.rbac_permissions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'QMS:WorkOrder:Confirm' } }),
    );
    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          permissionId: 'list-permission',
          roleId: 'qc-1',
        }),
        expect.objectContaining({
          permissionId: 'confirm-permission',
          roleId: 'qc-1',
        }),
      ],
      skipDuplicates: true,
    });
    expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
  });

  it('creates the permission record when no active QC role exists yet', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.rbac_permissions.upsert).mockResolvedValue({
      id: 'permission',
    } as never);

    await expect(backfillWorkOrderConfirmPermission('apply')).resolves.toEqual({
      alreadyGrantedRoleCount: 0,
      candidateRoleCount: 0,
      createdRolePermissionCount: 0,
      mode: 'apply',
      pendingRoleCount: 0,
    });
    expect(ensureModuleMenus).toHaveBeenCalledOnce();
    expect(prisma.rbac_permissions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
  });

  it('preserves confirmation access for editors without changing unrelated roles', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('editor-1', 'planner', ['QMS:WorkOrder:Edit']),
      role('viewer-1', 'viewer', []),
    ] as never);
    vi.mocked(prisma.rbac_permissions.upsert)
      .mockResolvedValueOnce({ id: 'list-permission' } as never)
      .mockResolvedValueOnce({ id: 'confirm-permission' } as never);
    vi.mocked(prisma.rbac_role_permissions.createMany).mockResolvedValue({
      count: 1,
    });

    await expect(backfillWorkOrderConfirmPermission('apply')).resolves.toEqual({
      alreadyGrantedRoleCount: 0,
      candidateRoleCount: 1,
      createdRolePermissionCount: 1,
      mode: 'apply',
      pendingRoleCount: 1,
    });
    expect(prisma.rbac_role_permissions.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          permissionId: 'confirm-permission',
          roleId: 'editor-1',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('is idempotent after every active QC role has the permission', async () => {
    vi.mocked(prisma.roles.findMany).mockResolvedValue([
      role('qc-1', 'QC', ['QMS:WorkOrder:List', 'QMS:WorkOrder:Confirm']),
    ] as never);
    vi.mocked(prisma.rbac_permissions.upsert).mockResolvedValue({
      id: 'permission',
    } as never);

    await expect(backfillWorkOrderConfirmPermission('apply')).resolves.toEqual({
      alreadyGrantedRoleCount: 1,
      candidateRoleCount: 1,
      createdRolePermissionCount: 0,
      mode: 'apply',
      pendingRoleCount: 0,
    });
    expect(ensureModuleMenus).toHaveBeenCalledOnce();
    expect(prisma.rbac_permissions.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.rbac_role_permissions.createMany).not.toHaveBeenCalled();
    expect(redis.delByPattern).not.toHaveBeenCalled();
  });

  it('parses explicit modes and rejects unknown arguments', () => {
    expect(parseWorkOrderConfirmPermissionBackfillMode([])).toBe('dry-run');
    expect(parseWorkOrderConfirmPermissionBackfillMode(['--apply'])).toBe(
      'apply',
    );
    expect(() =>
      parseWorkOrderConfirmPermissionBackfillMode(['--unexpected']),
    ).toThrow('unknown argument: --unexpected');
  });

  it('does not keep the historical QC grant in every release', () => {
    const maintenance = readFileSync(
      resolve(getBackendRoot(), 'scripts/run-release-maintenance.sh'),
      'utf8',
    );
    expect(maintenance).not.toContain(
      'scripts/backfill-role-page-permissions.ts',
    );
    expect(maintenance).not.toContain(
      'scripts/backfill-work-order-confirm-permission.ts',
    );
  });
});
