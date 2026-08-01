import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOnlineResolutionDescriptor } from '~/modules/master-data-identity';

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    get: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock('~/modules/master-data-identity', () => ({
  getOnlineResolutionDescriptor: vi.fn(),
  HistoricalIdentityResolutionService: { resolveManualWorkItem: vi.fn() },
}));

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: { listCanonicalOptions: vi.fn() },
}));

vi.mock('~/modules/inspection', () => ({
  InspectionClassificationResolutionService: {
    resolve: vi.fn(),
  },
  InspectionDepartmentResolutionService: {
    resolve: vi.fn(),
  },
  InspectionProcessResolutionService: {
    resolve: vi.fn(),
  },
}));

vi.mock('~/modules/after-sales', () => ({
  AfterSalesClassificationResolutionService: {
    resolve: vi.fn(),
  },
}));

describe('master data governance service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOnlineResolutionDescriptor).mockReturnValue({
      configKey: 'partName',
      kind: 'IDENTITY',
      multiple: false,
    });
  });

  it('delegates listing to the audit owner with an open default', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.list).mockResolvedValue({
      items: [],
      total: 0,
    } as never);

    await MasterDataGovernanceService.list({ page: 1, pageSize: 20 });

    expect(MasterDataResolutionAuditService.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: 'OPEN',
    });
  });

  it('returns registry resolution capability with each work item', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.list).mockResolvedValue({
      items: [
        {
          entityType: 'qms_inspection_requests',
          fieldName: 'partId',
          id: 'audit-1',
        },
      ],
      total: 1,
    } as never);

    await expect(
      MasterDataGovernanceService.list({ page: 1, pageSize: 20 }),
    ).resolves.toEqual({
      items: [
        {
          entityType: 'qms_inspection_requests',
          fieldName: 'partId',
          id: 'audit-1',
          resolution: {
            configKey: 'partName',
            kind: 'IDENTITY',
            multiple: false,
          },
        },
      ],
      total: 1,
    });
  });

  it('routes classification references to the sidecar ledger without changing facts', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { HistoricalIdentityResolutionService } = await import(
      '~/modules/master-data-identity'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      fieldName: 'defectClassification',
      id: 'audit-1',
    } as never);
    vi.mocked(getOnlineResolutionDescriptor).mockReturnValue({
      kind: 'CLASSIFICATION',
      scope: 'INSPECTION_ISSUE_DEFECT',
    });
    vi.mocked(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).mockResolvedValue({ auditId: 'audit-1' } as never);

    const input = {
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: '',
      subcategoryId: 'subcategory-1',
    };
    await MasterDataGovernanceService.resolve({
      ...input,
      resolutionType: 'CLASSIFICATION',
    });

    expect(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).toHaveBeenCalledWith({
      actorId: '',
      auditId: 'audit-1',
      canonicalId: 'subcategory-1',
      note: '',
    });
  });

  it('routes department references to the sidecar ledger', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { HistoricalIdentityResolutionService } = await import(
      '~/modules/master-data-identity'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      fieldName: 'responsibleDepartmentId',
      id: 'audit-department',
    } as never);
    vi.mocked(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).mockResolvedValue({
      auditId: 'audit-department',
    } as never);
    const input = {
      auditId: 'audit-department',
      departmentId: 'dept-production',
      note: '',
      resolutionType: 'DEPARTMENT' as const,
    };

    await MasterDataGovernanceService.resolve(input);

    expect(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).toHaveBeenCalledWith({
      actorId: '',
      auditId: 'audit-department',
      canonicalId: 'dept-production',
      note: '',
    });
  });

  it('routes inspection request process references to the sidecar ledger', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { HistoricalIdentityResolutionService } = await import(
      '~/modules/master-data-identity'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'qms_inspection_requests',
      fieldName: 'processId',
      id: 'audit-process',
    } as never);
    vi.mocked(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).mockResolvedValue({
      auditId: 'audit-process',
    } as never);
    const input = {
      auditId: 'audit-process',
      note: '',
      processId: 'process-incoming',
      resolutionType: 'PROCESS' as const,
    };

    await MasterDataGovernanceService.resolve(input);

    expect(
      HistoricalIdentityResolutionService.resolveManualWorkItem,
    ).toHaveBeenCalledWith({
      actorId: '',
      auditId: 'audit-process',
      canonicalId: 'process-incoming',
      note: '',
    });
  });

  it.each([
    ['qms_inspection_requests', 'partId', 'part-1', 'partName'],
    ['quality_records', 'projectId', 'project-1', 'projectName'],
    ['after_sales', 'projectId', 'project-2', 'projectName'],
  ])(
    'provides options and resolves %s.%s through the identity sidecar',
    async (entityType, fieldName, canonicalId, configKey) => {
      const { MasterDataGovernanceService } = await import(
        './master-data-governance.service'
      );
      const { MasterDataResolutionAuditService } = await import(
        '~/modules/supplier-identity'
      );
      const { HistoricalIdentityResolutionService } = await import(
        '~/modules/master-data-identity'
      );
      const { MasterDataGovernanceKernel } = await import(
        '~/utils/canonical-master-data'
      );
      vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
        entityType,
        fieldName,
        id: `audit-${fieldName}`,
        status: 'OPEN',
      } as never);
      vi.mocked(getOnlineResolutionDescriptor).mockReturnValue({
        configKey,
        kind: 'IDENTITY',
        multiple: false,
      });
      vi.mocked(
        MasterDataGovernanceKernel.listCanonicalOptions,
      ).mockResolvedValue([{ id: canonicalId, name: 'Canonical name' }]);
      vi.mocked(
        HistoricalIdentityResolutionService.resolveManualWorkItem,
      ).mockResolvedValue({ auditId: `audit-${fieldName}` } as never);

      await expect(
        MasterDataGovernanceService.listOptions(`audit-${fieldName}`),
      ).resolves.toEqual({
        items: [{ id: canonicalId, name: 'Canonical name' }],
        multiple: false,
      });
      expect(
        MasterDataGovernanceKernel.listCanonicalOptions,
      ).toHaveBeenCalledWith({ configKey, keyword: '' });
      await MasterDataGovernanceService.resolve({
        actorId: 'user-1',
        auditId: `audit-${fieldName}`,
        canonicalIds: [canonicalId],
        note: 'Confirmed',
        resolutionType: 'IDENTITY',
      });

      expect(
        HistoricalIdentityResolutionService.resolveManualWorkItem,
      ).toHaveBeenCalledWith({
        actorId: 'user-1',
        auditId: `audit-${fieldName}`,
        canonicalId,
        note: 'Confirmed',
      });
    },
  );
});
