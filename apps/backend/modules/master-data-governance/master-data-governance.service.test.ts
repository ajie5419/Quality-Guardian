import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    get: vi.fn(),
    list: vi.fn(),
  },
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

  it('routes inspection classification references to the owning domain', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { InspectionClassificationResolutionService } = await import(
      '~/modules/inspection'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      id: 'audit-1',
    } as never);
    vi.mocked(
      InspectionClassificationResolutionService.resolve,
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
      InspectionClassificationResolutionService.resolve,
    ).toHaveBeenCalledWith({
      ...input,
      resolutionType: 'CLASSIFICATION',
    });
  });

  it('routes inspection department references to the owning domain', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { InspectionDepartmentResolutionService } = await import(
      '~/modules/inspection'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'quality_records',
      fieldName: 'responsibleDepartmentId',
      id: 'audit-department',
    } as never);
    vi.mocked(InspectionDepartmentResolutionService.resolve).mockResolvedValue({
      auditId: 'audit-department',
    } as never);
    const input = {
      auditId: 'audit-department',
      departmentId: 'dept-production',
      note: '',
      resolutionType: 'DEPARTMENT' as const,
    };

    await MasterDataGovernanceService.resolve(input);

    expect(InspectionDepartmentResolutionService.resolve).toHaveBeenCalledWith(
      input,
    );
  });

  it('routes inspection request process references to the owning domain', async () => {
    const { MasterDataGovernanceService } = await import(
      './master-data-governance.service'
    );
    const { InspectionProcessResolutionService } = await import(
      '~/modules/inspection'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityType: 'qms_inspection_requests',
      fieldName: 'processId',
      id: 'audit-process',
    } as never);
    vi.mocked(InspectionProcessResolutionService.resolve).mockResolvedValue({
      auditId: 'audit-process',
    } as never);
    const input = {
      auditId: 'audit-process',
      note: '',
      processId: 'process-incoming',
      resolutionType: 'PROCESS' as const,
    };

    await MasterDataGovernanceService.resolve(input);

    expect(InspectionProcessResolutionService.resolve).toHaveBeenCalledWith(
      input,
    );
  });
});
