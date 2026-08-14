import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  quality_records: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  quality_loss_index_jobs: {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
};

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveById: vi.fn(),
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    findMatchingOpenBatch: vi.fn(),
    get: vi.fn(),
    resolveMany: vi.fn(),
  },
}));

describe('inspection department resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates matching issue snapshots and closes only eligible audits', async () => {
    const { DeptService } = await import('~/modules/dept');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { InspectionDepartmentResolutionService } = await import(
      './inspection-department-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      fieldName: 'responsibleDepartmentId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Production OBU',
      status: 'OPEN',
    } as never);
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: 'Manufacturing',
      id: 'dept-production',
      name: 'Production Department',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'issue-1', id: 'audit-1' },
        { entityId: 'deleted-issue', id: 'stale-audit' },
      ])
      .mockResolvedValueOnce([]);
    tx.quality_records.findMany.mockResolvedValue([{ id: 'issue-1' }]);
    tx.quality_records.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    const result = await InspectionDepartmentResolutionService.resolve({
      auditId: 'audit-1',
      departmentId: 'dept-production',
      note: 'Confirmed',
    });

    expect(result).toMatchObject({
      affectedCount: 1,
      resolvedAuditCount: 1,
    });
    expect(tx.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['issue-1'] },
        isDeleted: false,
        responsibleDepartment: 'Production OBU',
        responsibleDepartmentId: null,
      },
      data: {
        responsibleBU: 'Manufacturing',
        responsibleDepartment: 'Production Department',
        responsibleDepartmentId: 'dept-production',
        responsibleDepartments: JSON.stringify(['Production Department']),
      },
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['audit-1'],
        resolvedId: 'dept-production',
      }),
      tx,
    );
  });

  it('keeps the audit open when the issue changes concurrently', async () => {
    const { DeptService } = await import('~/modules/dept');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { InspectionDepartmentResolutionService } = await import(
      './inspection-department-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      fieldName: 'responsibleDepartmentId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Production OBU',
      status: 'OPEN',
    } as never);
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-production',
      name: 'Production Department',
    });
    vi.mocked(
      MasterDataResolutionAuditService.findMatchingOpenBatch,
    ).mockResolvedValueOnce([{ entityId: 'issue-1', id: 'audit-1' }]);
    tx.quality_records.findMany.mockResolvedValue([{ id: 'issue-1' }]);
    tx.quality_records.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      InspectionDepartmentResolutionService.resolve({
        auditId: 'audit-1',
        departmentId: 'dept-production',
        note: '',
      }),
    ).rejects.toMatchObject({
      code: 'MASTER_DATA_REFERENCE_CHANGED',
      httpStatus: 409,
    });
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });
});
