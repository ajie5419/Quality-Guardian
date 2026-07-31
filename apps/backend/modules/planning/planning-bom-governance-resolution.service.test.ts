import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  project_bom_required_processes: { createMany: vi.fn() },
  project_boms: { updateMany: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

vi.mock('~/modules/part-master', () => ({
  PartMasterService: { assertActive: vi.fn() },
}));

vi.mock('~/modules/process-master', () => ({
  ProcessMasterService: { findActiveById: vi.fn() },
}));

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    findMatchingOpenBatch: vi.fn(),
    get: vi.fn(),
    resolveMany: vi.fn(),
  },
}));

describe('planning BOM governance resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only matching BOM part identities and preserves name snapshots', async () => {
    const { PartMasterService } = await import('~/modules/part-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { PlanningBomGovernanceResolutionService } = await import(
      './planning-bom-governance-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'project_boms',
      fieldName: 'partId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Legacy motor',
      status: 'OPEN',
    } as never);
    vi.mocked(PartMasterService.assertActive).mockResolvedValue({
      id: 'part-1',
      name: 'Canonical motor',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'bom-1', id: 'audit-1' },
        { entityId: 'changed-bom', id: 'audit-2' },
      ])
      .mockResolvedValueOnce([]);
    tx.project_boms.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    const result = await PlanningBomGovernanceResolutionService.resolvePart({
      auditId: 'audit-1',
      note: 'Confirmed',
      partId: 'part-1',
    });

    expect(result).toMatchObject({
      affectedCount: 1,
      resolvedAuditCount: 1,
    });
    expect(tx.project_boms.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'bom-1', partId: null, part_name: 'Legacy motor' },
      data: { partId: 'part-1' },
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['audit-1'], resolvedId: 'part-1' }),
      tx,
    );
  });

  it('replaces missing BOM process identities and closes only applied audits', async () => {
    const { ProcessMasterService } = await import('~/modules/process-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { PlanningBomGovernanceResolutionService } = await import(
      './planning-bom-governance-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'project_boms',
      fieldName: 'requiredProcessIds',
      id: 'audit-1',
      rawId: null,
      rawName: '["Legacy welding"]',
      status: 'OPEN',
    } as never);
    vi.mocked(ProcessMasterService.findActiveById)
      .mockResolvedValueOnce({ id: 'process-1', name: 'Welding' })
      .mockResolvedValueOnce({ id: 'process-2', name: 'Painting' });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'bom-1', id: 'audit-1' },
        { entityId: 'changed-bom', id: 'audit-2' },
      ])
      .mockResolvedValueOnce([]);
    tx.project_boms.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    tx.project_bom_required_processes.createMany.mockResolvedValue({
      count: 2,
    });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    const result =
      await PlanningBomGovernanceResolutionService.resolveRequiredProcesses({
        auditId: 'audit-1',
        note: '',
        processIds: ['process-1', 'process-2'],
      });

    expect(result).toMatchObject({
      affectedCount: 1,
      resolvedAuditCount: 1,
    });
    expect(tx.project_boms.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'bom-1',
        required_processes: '["Legacy welding"]',
        processRequirements: { none: {} },
      },
      data: { required_processes: '["Welding","Painting"]' },
    });
    expect(tx.project_bom_required_processes.createMany).toHaveBeenCalledWith({
      data: [
        {
          bomId: 'bom-1',
          position: 0,
          processId: 'process-1',
          processName: 'Welding',
        },
        {
          bomId: 'bom-1',
          position: 1,
          processId: 'process-2',
          processName: 'Painting',
        },
      ],
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['audit-1'],
        resolvedId: 'process-1,process-2',
      }),
      tx,
    );
  });

  it('keeps stale process audits open when no BOM snapshot still matches', async () => {
    const { ProcessMasterService } = await import('~/modules/process-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    const { PlanningBomGovernanceResolutionService } = await import(
      './planning-bom-governance-resolution.service'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'project_boms',
      fieldName: 'requiredProcessIds',
      id: 'audit-1',
      rawId: null,
      rawName: '["Legacy welding"]',
      status: 'OPEN',
    } as never);
    vi.mocked(ProcessMasterService.findActiveById).mockResolvedValue({
      id: 'process-1',
      name: 'Welding',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([{ entityId: 'bom-1', id: 'audit-1' }])
      .mockResolvedValueOnce([]);
    tx.project_boms.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      PlanningBomGovernanceResolutionService.resolveRequiredProcesses({
        auditId: 'audit-1',
        note: '',
        processIds: ['process-1'],
      }),
    ).rejects.toMatchObject({
      code: 'MASTER_DATA_REFERENCE_CHANGED',
      httpStatus: 409,
    });
    expect(tx.project_bom_required_processes.createMany).not.toHaveBeenCalled();
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });
});
