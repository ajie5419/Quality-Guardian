import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  $queryRaw: vi.fn(),
  inspections: { findMany: vi.fn(), updateMany: vi.fn() },
  supplier_identity_links: { findFirst: vi.fn() },
  team_identity_merge_participants: { findUnique: vi.fn() },
};

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
  SupplierIdentityService: {
    lockTeamForMutation: vi.fn(),
    resolveSupplierByTeamId: vi.fn(),
  },
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

  it('locks TEAM mappings and resolves suppliers through the transaction', async () => {
    const { MasterDataResolutionAuditService, SupplierIdentityService } =
      await import('~/modules/supplier-identity');
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { InspectionIdentityResolutionService } = await import(
      './inspection-identity-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'inspections',
      fieldName: 'supplierId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Legacy supplier',
      status: 'OPEN',
    } as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['supplier-1', 'Supplier']]));
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([{ entityId: 'inspection-1', id: 'audit-1' }])
      .mockResolvedValueOnce([]);
    tx.inspections.findMany
      .mockResolvedValueOnce([{ id: 'inspection-1' }])
      .mockResolvedValueOnce([{ id: 'inspection-1', teamId: 'team-1' }]);
    tx.inspections.updateMany.mockResolvedValue({ count: 1 });
    vi.mocked(
      SupplierIdentityService.resolveSupplierByTeamId,
    ).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier',
    });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    await InspectionIdentityResolutionService.resolve({
      auditId: 'audit-1',
      canonicalId: 'supplier-1',
      note: '',
    });

    expect(SupplierIdentityService.lockTeamForMutation).toHaveBeenCalledWith(
      'team-1',
      tx,
    );
    expect(
      SupplierIdentityService.resolveSupplierByTeamId,
    ).toHaveBeenCalledWith('team-1', tx);
  });
});
