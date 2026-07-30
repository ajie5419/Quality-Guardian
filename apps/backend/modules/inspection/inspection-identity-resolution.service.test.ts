import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { inspections: { findMany: vi.fn(), updateMany: vi.fn() } };

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));
vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: { resolveCanonicalNamesByIds: vi.fn() },
}));
vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    findMatchingOpenBatch: vi.fn(),
    get: vi.fn(),
    resolveMany: vi.fn(),
  },
  SupplierIdentityService: { resolveSupplierByTeamId: vi.fn() },
}));

describe('inspection identity resolution service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('repairs IDs while preserving historical name snapshots', async () => {
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { InspectionIdentityResolutionService } = await import(
      './inspection-identity-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'inspections',
      fieldName: 'partId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Legacy reducer',
      status: 'OPEN',
    } as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['part-1', 'Reducer']]));
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([{ entityId: 'inspection-1', id: 'audit-1' }])
      .mockResolvedValueOnce([]);
    tx.inspections.findMany.mockResolvedValue([{ id: 'inspection-1' }]);
    tx.inspections.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    await InspectionIdentityResolutionService.resolve({
      auditId: 'audit-1',
      canonicalId: 'part-1',
      note: '',
    });

    expect(tx.inspections.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['inspection-1'] },
        isDeleted: false,
        partId: null,
        partName: 'Legacy reducer',
      },
      data: { partId: 'part-1' },
    });
  });

  it('does not close audits for deleted or concurrently changed rows', async () => {
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { InspectionIdentityResolutionService } = await import(
      './inspection-identity-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'inspections',
      fieldName: 'materialNameId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Steel',
      status: 'OPEN',
    } as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['material-1', 'Steel']]));
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([{ entityId: 'inspection-1', id: 'audit-1' }])
      .mockResolvedValueOnce([]);
    tx.inspections.findMany.mockResolvedValue([]);

    await expect(
      InspectionIdentityResolutionService.resolve({
        auditId: 'audit-1',
        canonicalId: 'material-1',
        note: '',
      }),
    ).rejects.toMatchObject({ code: 'MASTER_DATA_REFERENCE_CHANGED' });
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });
});
