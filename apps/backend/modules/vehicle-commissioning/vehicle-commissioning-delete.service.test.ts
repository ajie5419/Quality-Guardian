import { VEHICLE_COMMISSIONING_PERMISSION_CODES } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage';
import { RbacService } from '~/modules/rbac';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningDeleteService } from '~/modules/vehicle-commissioning/vehicle-commissioning-delete.service';
import prisma from '~/utils/prisma';

const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock('~/utils/prisma', () => ({
  default: {
    vehicle_commissioning_issues: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    quality_loss_index_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage', () => ({
  FileStorageService: {
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexQueue: { enqueue: mocks.enqueue },
}));

vi.mock('~/modules/rbac', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

describe('vehicleCommissioningDeleteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback({
        vehicle_commissioning_issues: prisma.vehicle_commissioning_issues,
        quality_loss_index_jobs: prisma.quality_loss_index_jobs,
      }),
    );
  });

  const user = {
    id: 'user-1',
    realName: 'Operator',
    roles: [],
    username: 'operator',
  };

  it('rejects deletion before loading the issue without permission', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);

    await expect(
      VehicleCommissioningDeleteService.deleteIssue('issue-1', user),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    expect(
      prisma.vehicle_commissioning_issues.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('soft deletes dependents and records a delete audit', async () => {
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      VEHICLE_COMMISSIONING_PERMISSION_CODES.DELETE,
    ]);
    vi.mocked(prisma.vehicle_commissioning_issues.findFirst).mockResolvedValue({
      description: 'Brake issue',
      id: 'issue-1',
    } as never);
    vi.mocked(prisma.vehicle_commissioning_issues.updateMany).mockResolvedValue(
      {
        count: 1,
      } as never,
    );

    await VehicleCommissioningDeleteService.deleteIssue('issue-1', user);

    expect(prisma.vehicle_commissioning_issues.updateMany).toHaveBeenCalledWith(
      {
        where: { id: 'issue-1', isDeleted: false },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      },
    );
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'issue-1',
      bizType: 'vehicle_commissioning_issue',
    });
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicle_commissioning_issues: prisma.vehicle_commissioning_issues,
      }),
      [{ source: 'COMMISSIONING', sourcePk: 'issue-1' }],
      'vehicle-commissioning.deleted',
    );
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'vehicle-commissioning',
      'issueDelete',
      expect.objectContaining({
        detailsVariables: { issue: 'Brake issue' },
        targetId: 'issue-1',
        userId: 'user-1',
      }),
    );
  });
});
