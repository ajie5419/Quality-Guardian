import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  after_sales: {
    findFirst: vi.fn(),
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
    get: vi.fn(),
    resolve: vi.fn(),
  },
}));

describe('after-sales classification resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      status: 'OPEN',
    } as never);
    tx.after_sales.findFirst.mockResolvedValue({
      defectCategoryId: null,
      defectSubcategoryId: null,
      id: 'after-sales-1',
      productCategoryId: null,
      productSubcategoryId: null,
    });

    await AfterSalesClassificationResolutionService.resolve({
      auditId: 'audit-1',
      categoryId: 'category-1',
      note: 'Confirmed',
      subcategoryId: 'subcategory-1',
    });

    expect(tx.after_sales.update).toHaveBeenCalledWith({
      where: { id: 'after-sales-1' },
      data: {
        productCategoryId: 'category-1',
        productSubcategoryId: 'subcategory-1',
        productSubtype: 'Vehicle OBU',
        productType: 'On-board product',
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
});
