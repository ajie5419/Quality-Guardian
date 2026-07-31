import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  dictionaries: { findFirst: vi.fn() },
  supplier_identity_links: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
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
vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: { enqueueSupplierScores: vi.fn() },
}));
vi.mock('./master-data-resolution-audit.service', () => ({
  MasterDataResolutionAuditService: { get: vi.fn(), resolve: vi.fn() },
}));
vi.mock('./supplier-identity.service', () => ({
  SupplierIdentityService: { lockTeamForMutation: vi.fn() },
}));

describe('supplier identity governance resolution service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('relinks a matching TEAM mapping and resolves its audit atomically', async () => {
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { MasterDataResolutionAuditService } = await import(
      './master-data-resolution-audit.service'
    );
    const { SupplierIdentityGovernanceResolutionService } = await import(
      './supplier-identity-governance-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'team-1',
      entityType: 'supplier_identity_links',
      fieldName: 'supplierId',
      id: 'audit-1',
      rawId: 'supplier-old',
      rawName: 'Legacy TEAM',
      status: 'OPEN',
    } as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['supplier-new', 'New supplier']]));
    tx.supplier_identity_links.findUnique.mockResolvedValue({
      id: 'link-1',
      identityNameSnapshot: 'Legacy TEAM',
      supplierId: 'supplier-old',
    });
    tx.dictionaries.findFirst.mockResolvedValue({
      dictKey: 'Current TEAM',
      id: 'team-1',
    });
    tx.supplier_identity_links.update.mockResolvedValue({ id: 'link-1' });

    const result = await SupplierIdentityGovernanceResolutionService.resolve({
      auditId: 'audit-1',
      note: 'Confirmed',
      supplierId: 'supplier-new',
    });

    expect(result).toMatchObject({ affectedCount: 1, resolvedAuditCount: 1 });
    expect(MasterDataResolutionAuditService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'audit-1', resolvedId: 'supplier-new' }),
      tx,
    );
  });

  it('rejects a mapping changed after the audit', async () => {
    const { MasterDataGovernanceKernel } = await import(
      '~/utils/canonical-master-data'
    );
    const { MasterDataResolutionAuditService } = await import(
      './master-data-resolution-audit.service'
    );
    const { SupplierIdentityGovernanceResolutionService } = await import(
      './supplier-identity-governance-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'team-1',
      entityType: 'supplier_identity_links',
      fieldName: 'supplierId',
      id: 'audit-1',
      rawId: 'supplier-old',
      rawName: 'Legacy TEAM',
      status: 'OPEN',
    } as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNamesByIds,
    ).mockResolvedValue(new Map([['supplier-new', 'New supplier']]));
    tx.supplier_identity_links.findUnique.mockResolvedValue({
      id: 'link-1',
      identityNameSnapshot: 'Legacy TEAM',
      supplierId: 'supplier-other',
    });

    await expect(
      SupplierIdentityGovernanceResolutionService.resolve({
        auditId: 'audit-1',
        note: '',
        supplierId: 'supplier-new',
      }),
    ).rejects.toMatchObject({ code: 'MASTER_DATA_REFERENCE_CHANGED' });
    expect(MasterDataResolutionAuditService.resolve).not.toHaveBeenCalled();
  });
});
