import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  master_projects: { findFirst: vi.fn() },
  work_order_requirements: { updateMany: vi.fn() },
  work_orders: { updateMany: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(async (callback) => callback(tx)),
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    findMatchingOpenBatch: vi.fn(),
    get: vi.fn(),
    resolveMany: vi.fn(),
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveById: vi.fn() },
}));

vi.mock('~/modules/dictionary', () => ({
  DictionaryService: { getOptions: vi.fn() },
}));

vi.mock('~/modules/part-master', () => ({
  PartMasterService: { assertActive: vi.fn() },
}));

vi.mock('~/modules/process-master', () => ({
  ProcessMasterService: { findActiveById: vi.fn() },
}));

vi.mock('~/modules/team', () => ({
  TeamIdentityService: { resolveById: vi.fn() },
}));

describe('work order governance resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves matching work order projects and leaves stale audits open', async () => {
    const { WorkOrderGovernanceResolutionService } = await import(
      './work-order-governance-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'work_orders',
      fieldName: 'projectId',
      id: 'audit-1',
      rawId: 'old-project',
      rawName: 'Old project',
      status: 'OPEN',
    } as never);
    tx.master_projects.findFirst.mockResolvedValue({
      id: 'project-1',
      name: 'Canonical project',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'WO-1', id: 'audit-1' },
        { entityId: 'WO-deleted', id: 'audit-stale' },
      ])
      .mockResolvedValueOnce([]);
    tx.work_orders.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });

    await expect(
      WorkOrderGovernanceResolutionService.resolve({
        auditId: 'audit-1',
        note: 'mapped',
        resolvedId: 'project-1',
      }),
    ).resolves.toMatchObject({ affectedCount: 1, resolvedAuditCount: 1 });
    expect(tx.work_orders.updateMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        projectId: 'old-project',
        projectName: 'Old project',
        workOrderNumber: 'WO-1',
      },
      data: { projectId: 'project-1' },
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['audit-1'] }),
      tx,
    );
  });

  it.each([
    {
      canonicalId: 'dept-1',
      fieldName: 'divisionId',
      nameField: 'division',
      owner: 'department',
    },
    {
      canonicalId: 'customer-1',
      fieldName: 'customerNameId',
      nameField: 'customerName',
      owner: 'dictionary',
    },
  ])(
    'resolves the work order $fieldName through its owning service',
    async ({ canonicalId, fieldName, nameField, owner }) => {
      const { WorkOrderGovernanceResolutionService } = await import(
        './work-order-governance-resolution.service'
      );
      const { DeptService } = await import('~/modules/dept');
      const { DictionaryService } = await import('~/modules/dictionary');
      const { MasterDataResolutionAuditService } = await import(
        '~/modules/supplier-identity'
      );
      vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
        entityType: 'work_orders',
        fieldName,
        id: 'audit-1',
        rawId: null,
        rawName: 'Legacy',
        status: 'OPEN',
      } as never);
      vi.mocked(DeptService.findActiveById).mockResolvedValue({
        businessUnit: null,
        id: canonicalId,
        name: 'Canonical',
      });
      vi.mocked(DictionaryService.getOptions).mockResolvedValue([
        {
          dictKey: 'Canonical',
          dictValue: 'Canonical',
          id: canonicalId,
          sort: 0,
        },
      ]);
      vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
        .mockResolvedValueOnce([{ entityId: 'WO-1', id: 'audit-1' }])
        .mockResolvedValueOnce([]);
      tx.work_orders.updateMany.mockResolvedValue({ count: 1 });
      vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue(
        { count: 1 },
      );

      await WorkOrderGovernanceResolutionService.resolve({
        auditId: 'audit-1',
        note: '',
        resolvedId: canonicalId,
      });

      expect(tx.work_orders.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          [fieldName]: null,
          [nameField]: 'Legacy',
        }),
        data: { [fieldName]: canonicalId },
      });
      if (owner === 'department')
        expect(DeptService.findActiveById).toHaveBeenCalledWith(
          canonicalId,
          tx,
        );
      else
        expect(DictionaryService.getOptions).toHaveBeenCalledWith(
          'customer_name',
        );
    },
  );

  it.each([
    ['processId', 'process-1', 'processName', 'process'],
    ['partId', 'part-1', 'partName', 'part'],
    ['requirementId', 'requirement-1', 'requirementName', 'requirement'],
    ['responsibleTeamId', 'team-1', 'responsibleTeam', 'team'],
  ] as const)(
    'resolves requirement %s and retains its historical name snapshot',
    async (fieldName, canonicalId, nameField, owner) => {
      const { WorkOrderGovernanceResolutionService } = await import(
        './work-order-governance-resolution.service'
      );
      const { DictionaryService } = await import('~/modules/dictionary');
      const { PartMasterService } = await import('~/modules/part-master');
      const { ProcessMasterService } = await import('~/modules/process-master');
      const { MasterDataResolutionAuditService } = await import(
        '~/modules/supplier-identity'
      );
      const { TeamIdentityService } = await import('~/modules/team');
      vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
        entityType: 'work_order_requirements',
        fieldName,
        id: 'audit-1',
        rawId: 'legacy-id',
        rawName: 'Legacy',
        status: 'OPEN',
      } as never);
      vi.mocked(ProcessMasterService.findActiveById).mockResolvedValue({
        id: canonicalId,
        name: 'Canonical',
      });
      vi.mocked(PartMasterService.assertActive).mockResolvedValue({
        id: canonicalId,
        name: 'Canonical',
      });
      vi.mocked(DictionaryService.getOptions).mockResolvedValue([
        {
          dictKey: 'Canonical',
          dictValue: 'Canonical',
          id: canonicalId,
          sort: 0,
        },
      ]);
      vi.mocked(TeamIdentityService.resolveById).mockResolvedValue({
        id: canonicalId,
        name: 'Canonical',
        remark: null,
        sort: 0,
        status: 1,
      });
      vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
        .mockResolvedValueOnce([{ entityId: 'requirement-1', id: 'audit-1' }])
        .mockResolvedValueOnce([]);
      tx.work_order_requirements.updateMany.mockResolvedValue({ count: 1 });
      vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue(
        { count: 1 },
      );

      await WorkOrderGovernanceResolutionService.resolve({
        auditId: 'audit-1',
        note: '',
        resolvedId: canonicalId,
      });

      expect(tx.work_order_requirements.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          [fieldName]: 'legacy-id',
          [nameField]: 'Legacy',
        }),
        data: { [fieldName]: canonicalId },
      });
      if (owner === 'process')
        expect(ProcessMasterService.findActiveById).toHaveBeenCalledWith(
          canonicalId,
          tx,
        );
      if (owner === 'part')
        expect(PartMasterService.assertActive).toHaveBeenCalledWith(
          canonicalId,
          tx,
        );
      if (owner === 'requirement')
        expect(DictionaryService.getOptions).toHaveBeenCalledWith(
          'requirement_name',
        );
      if (owner === 'team')
        expect(TeamIdentityService.resolveById).toHaveBeenCalledWith(
          canonicalId,
        );
    },
  );

  it('does not close an audit after the source identity changed', async () => {
    const { WorkOrderGovernanceResolutionService } = await import(
      './work-order-governance-resolution.service'
    );
    const { ProcessMasterService } = await import('~/modules/process-master');
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'work_order_requirements',
      fieldName: 'processId',
      id: 'audit-1',
      rawId: null,
      rawName: 'Legacy',
      status: 'OPEN',
    } as never);
    vi.mocked(ProcessMasterService.findActiveById).mockResolvedValue({
      id: 'process-1',
      name: 'Canonical',
    });
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([{ entityId: 'requirement-1', id: 'audit-1' }])
      .mockResolvedValueOnce([]);
    tx.work_order_requirements.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      WorkOrderGovernanceResolutionService.resolve({
        auditId: 'audit-1',
        note: '',
        resolvedId: 'process-1',
      }),
    ).rejects.toMatchObject({ code: 'MASTER_DATA_REFERENCE_CHANGED' });
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });
});
