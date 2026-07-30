import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  qms_inspection_requests: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

vi.mock('~/modules/process-master', () => ({
  ProcessMasterService: {
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

describe('inspection process resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates matching request snapshots and closes only eligible audits', async () => {
    const { ProcessMasterService } = await import('~/modules/process-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { InspectionProcessResolutionService } = await import(
      './inspection-process-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'qms_inspection_requests',
      fieldName: 'processId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Incoming inspection',
      status: 'OPEN',
    } as never);
    vi.mocked(ProcessMasterService.findActiveById).mockResolvedValue({
      id: 'process-incoming',
      name: 'Incoming quality inspection',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'request-1', id: 'audit-1' },
        { entityId: 'deleted-request', id: 'stale-audit' },
      ])
      .mockResolvedValueOnce([]);
    tx.qms_inspection_requests.findMany.mockResolvedValue([
      { id: 'request-1' },
    ]);
    tx.qms_inspection_requests.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    const result = await InspectionProcessResolutionService.resolve({
      auditId: 'audit-1',
      note: 'Confirmed',
      processId: 'process-incoming',
    });

    expect(result).toMatchObject({
      affectedCount: 1,
      resolvedAuditCount: 1,
    });
    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['request-1'] },
        isDeleted: false,
        processId: null,
        processName: 'Incoming inspection',
      },
      data: {
        processId: 'process-incoming',
        processName: 'Incoming quality inspection',
      },
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['audit-1'],
        resolvedId: 'process-incoming',
      }),
      tx,
    );
  });

  it('keeps the audit open when the request changes concurrently', async () => {
    const { ProcessMasterService } = await import('~/modules/process-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { InspectionProcessResolutionService } = await import(
      './inspection-process-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'qms_inspection_requests',
      fieldName: 'processId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Incoming inspection',
      status: 'OPEN',
    } as never);
    vi.mocked(ProcessMasterService.findActiveById).mockResolvedValue({
      id: 'process-incoming',
      name: 'Incoming quality inspection',
    });
    vi.mocked(
      MasterDataResolutionAuditService.findMatchingOpenBatch,
    ).mockResolvedValueOnce([{ entityId: 'request-1', id: 'audit-1' }]);
    tx.qms_inspection_requests.findMany.mockResolvedValue([
      { id: 'request-1' },
    ]);
    tx.qms_inspection_requests.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      InspectionProcessResolutionService.resolve({
        auditId: 'audit-1',
        note: '',
        processId: 'process-incoming',
      }),
    ).rejects.toMatchObject({
      code: 'MASTER_DATA_REFERENCE_CHANGED',
      httpStatus: 409,
    });
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });
});
