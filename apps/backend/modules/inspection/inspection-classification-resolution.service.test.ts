import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  quality_records: {
    findFirst: vi.fn(),
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

vi.mock('~/modules/quality-classification', () => ({
  QualityClassificationService: {
    assertSelection: vi.fn().mockResolvedValue({
      category: { id: 'category-1', name: 'Manufacturing defect' },
      subcategory: { id: 'subcategory-1', name: 'Machining accuracy' },
    }),
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: {
    findMatchingOpenBatch: vi.fn(),
    get: vi.fn(),
    resolveMany: vi.fn(),
  },
}));

describe('inspection classification resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.quality_records.findMany.mockResolvedValue([
      { id: 'issue-1' },
      { id: 'issue-2' },
    ]);
    tx.quality_records.updateMany.mockResolvedValue({ count: 2 });
  });

  it('updates the issue snapshot and closes its audit atomically', async () => {
    const { InspectionClassificationResolutionService } = await import(
      './inspection-classification-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'issue-1',
      entityType: 'quality_records',
      fieldName: 'defectClassification',
      id: 'audit-1',
      rawId: null,
      rawName: 'Manufacturing defect/Machining accuracy',
      status: 'OPEN',
    } as never);
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'issue-1', id: 'audit-1' },
        { entityId: 'issue-2', id: 'audit-2' },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 2,
    });
    tx.quality_records.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      defectSubtype: 'Machining accuracy',
      defectType: 'Manufacturing defect',
      id: 'issue-1',
    });

    const result = await InspectionClassificationResolutionService.resolve({
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: 'Confirmed',
      subcategoryId: 'subcategory-1',
    });

    expect(result).toMatchObject({
      affectedCount: 2,
      resolvedAuditCount: 2,
    });

    expect(tx.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        defectCategoryId: null,
        defectSubcategoryId: null,
        defectSubtype: 'Machining accuracy',
        defectType: 'Manufacturing defect',
        id: { in: ['issue-1', 'issue-2'] },
        isDeleted: false,
      },
      data: {
        defectCategoryId: 'category-1',
        defectSubcategoryId: 'subcategory-1',
        defectSubtype: 'Machining accuracy',
        defectType: 'Manufacturing defect',
      },
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['audit-1', 'audit-2'],
        resolvedId: 'subcategory-1',
      }),
      tx,
    );
  });

  it('does not close the audit after a concurrent classification change', async () => {
    const { InspectionClassificationResolutionService } = await import(
      './inspection-classification-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'issue-1',
      entityType: 'quality_records',
      fieldName: 'defectClassification',
      id: 'audit-1',
      rawId: null,
      rawName: 'Manufacturing defect/Machining accuracy',
      status: 'OPEN',
    } as never);
    tx.quality_records.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      defectSubtype: 'Machining accuracy',
      defectType: 'Manufacturing defect',
      id: 'issue-1',
    });
    vi.mocked(
      MasterDataResolutionAuditService.findMatchingOpenBatch,
    ).mockResolvedValueOnce([{ entityId: 'issue-1', id: 'audit-1' }]);
    tx.quality_records.findMany.mockResolvedValue([{ id: 'issue-1' }]);
    tx.quality_records.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      InspectionClassificationResolutionService.resolve({
        auditId: 'audit-1',
        categoryId: 'category-1',
        note: 'Confirmed',
        subcategoryId: 'subcategory-1',
      }),
    ).rejects.toMatchObject({
      code: 'MASTER_DATA_REFERENCE_CHANGED',
      httpStatus: 409,
    });
    expect(MasterDataResolutionAuditService.resolveMany).not.toHaveBeenCalled();
  });

  it('leaves stale matching audits open when their records are not eligible', async () => {
    const { InspectionClassificationResolutionService } = await import(
      './inspection-classification-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'issue-1',
      entityType: 'quality_records',
      fieldName: 'defectClassification',
      id: 'audit-1',
      rawId: null,
      rawName: 'Manufacturing defect/Machining accuracy',
      status: 'OPEN',
    } as never);
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'issue-1', id: 'audit-1' },
        { entityId: 'deleted-issue', id: 'stale-audit' },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 1,
    });
    tx.quality_records.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      defectSubtype: 'Machining accuracy',
      defectType: 'Manufacturing defect',
      id: 'issue-1',
    });
    tx.quality_records.findMany.mockResolvedValue([{ id: 'issue-1' }]);
    tx.quality_records.updateMany.mockResolvedValue({ count: 1 });

    const result = await InspectionClassificationResolutionService.resolve({
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: 'Confirmed',
      subcategoryId: 'subcategory-1',
    });

    expect(result).toMatchObject({
      affectedCount: 1,
      resolvedAuditCount: 1,
    });
    expect(MasterDataResolutionAuditService.resolveMany).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['audit-1'] }),
      tx,
    );
  });
});
