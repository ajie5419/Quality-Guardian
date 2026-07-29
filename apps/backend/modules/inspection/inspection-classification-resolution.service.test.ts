import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  quality_records: {
    findFirst: vi.fn(),
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
    get: vi.fn(),
    resolve: vi.fn(),
  },
}));

describe('inspection classification resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.quality_records.updateMany.mockResolvedValue({ count: 1 });
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
      status: 'OPEN',
    } as never);
    tx.quality_records.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      id: 'issue-1',
    });

    await InspectionClassificationResolutionService.resolve({
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: 'Confirmed',
      subcategoryId: 'subcategory-1',
    });

    expect(tx.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        defectCategoryId: null,
        defectSubcategoryId: null,
        id: 'issue-1',
        isDeleted: false,
      },
      data: {
        defectCategoryId: 'category-1',
        defectSubcategoryId: 'subcategory-1',
        defectSubtype: 'Machining accuracy',
        defectType: 'Manufacturing defect',
      },
    });
    expect(MasterDataResolutionAuditService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-1',
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
      status: 'OPEN',
    } as never);
    tx.quality_records.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      id: 'issue-1',
    });
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
    expect(MasterDataResolutionAuditService.resolve).not.toHaveBeenCalled();
  });
});
