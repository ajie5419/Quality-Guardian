import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  after_sales: {
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
      category: { id: 'category-1', name: 'On-board product' },
      subcategory: { id: 'subcategory-1', name: 'Vehicle OBU' },
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

describe('after-sales classification resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.after_sales.findMany.mockResolvedValue([
      { id: 'after-sales-1' },
      { id: 'after-sales-2' },
    ]);
    tx.after_sales.updateMany.mockResolvedValue({ count: 2 });
  });

  it('resolves a product classification without touching defect fields', async () => {
    const { AfterSalesClassificationResolutionService } = await import(
      './after-sales-classification-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'after-sales-1',
      entityType: 'after_sales',
      fieldName: 'productClassification',
      id: 'audit-1',
      rawId: null,
      rawName: 'On-board product/Vehicle OBU',
      status: 'OPEN',
    } as never);
    vi.mocked(MasterDataResolutionAuditService.findMatchingOpenBatch)
      .mockResolvedValueOnce([
        { entityId: 'after-sales-1', id: 'audit-1' },
        { entityId: 'after-sales-2', id: 'audit-2' },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(MasterDataResolutionAuditService.resolveMany).mockResolvedValue({
      count: 2,
    });
    tx.after_sales.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      id: 'after-sales-1',
      productCategoryId: null,
      productSubcategoryId: null,
      productSubtype: 'Vehicle OBU',
      productType: 'On-board product',
    });

    const result = await AfterSalesClassificationResolutionService.resolve({
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: 'Confirmed',
      subcategoryId: 'subcategory-1',
    });

    expect(result).toMatchObject({
      affectedCount: 2,
      resolvedAuditCount: 2,
    });

    expect(tx.after_sales.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['after-sales-1', 'after-sales-2'] },
        isDeleted: false,
        productCategoryId: null,
        productSubcategoryId: null,
        productSubtype: 'Vehicle OBU',
        productType: 'On-board product',
      },
      data: {
        productCategoryId: 'category-1',
        productSubcategoryId: 'subcategory-1',
        productSubtype: 'Vehicle OBU',
        productType: 'On-board product',
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

  it('rolls back when a concurrent edit wins the classification update', async () => {
    const { AfterSalesClassificationResolutionService } = await import(
      './after-sales-classification-resolution.service'
    );
    const { MasterDataResolutionAuditService } = await import(
      '~/modules/supplier-identity'
    );
    vi.mocked(MasterDataResolutionAuditService.get).mockResolvedValue({
      entityId: 'after-sales-1',
      entityType: 'after_sales',
      fieldName: 'productClassification',
      id: 'audit-1',
      rawId: null,
      rawName: 'On-board product/Vehicle OBU',
      status: 'OPEN',
    } as never);
    tx.after_sales.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      id: 'after-sales-1',
      productCategoryId: null,
      productSubcategoryId: null,
      productSubtype: 'Vehicle OBU',
      productType: 'On-board product',
    });
    vi.mocked(
      MasterDataResolutionAuditService.findMatchingOpenBatch,
    ).mockResolvedValueOnce([{ entityId: 'after-sales-1', id: 'audit-1' }]);
    tx.after_sales.findMany.mockResolvedValue([{ id: 'after-sales-1' }]);
    tx.after_sales.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      AfterSalesClassificationResolutionService.resolve({
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
});
