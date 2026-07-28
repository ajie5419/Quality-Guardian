import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { QualityClassificationService } from './quality-classification.service';

vi.mock('~/utils/prisma', () => {
  const client = {
    quality_classification_categories: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    quality_classification_subcategories: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { default: client };
});

describe('quality classification service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only active categories and subcategories as an ordered tree', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findMany,
    ).mockResolvedValue([
      {
        code: 'APPEARANCE',
        id: 'category-1',
        name: 'Appearance',
        scope: 'INSPECTION_ISSUE_DEFECT',
        sort: 1,
        status: 1,
        subcategories: [
          {
            code: 'SCRATCH',
            id: 'subcategory-1',
            name: 'Scratch',
            sort: 2,
            status: 1,
          },
        ],
      },
    ] as never);

    await expect(
      QualityClassificationService.listActiveTree('INSPECTION_ISSUE_DEFECT'),
    ).resolves.toEqual([
      {
        code: 'APPEARANCE',
        id: 'category-1',
        name: 'Appearance',
        scope: 'INSPECTION_ISSUE_DEFECT',
        sort: 1,
        status: 1,
        subcategories: [
          {
            code: 'SCRATCH',
            id: 'subcategory-1',
            name: 'Scratch',
            sort: 2,
            status: 1,
          },
        ],
      },
    ]);
    expect(
      prisma.quality_classification_categories.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          scope: 'INSPECTION_ISSUE_DEFECT',
          isDeleted: false,
          status: 1,
        },
      }),
    );
  });

  it('validates scope and parent-child membership in one query', async () => {
    vi.mocked(
      prisma.quality_classification_subcategories.findFirst,
    ).mockResolvedValue({
      category: {
        code: 'PRODUCT',
        id: 'category-1',
        name: 'Product',
      },
      code: 'VEHICLE',
      id: 'subcategory-1',
      name: 'Vehicle',
    } as never);

    await expect(
      QualityClassificationService.assertSelection(
        'AFTER_SALES_PRODUCT',
        'category-1',
        'subcategory-1',
      ),
    ).resolves.toEqual({
      category: {
        code: 'PRODUCT',
        id: 'category-1',
        name: 'Product',
      },
      subcategory: {
        code: 'VEHICLE',
        id: 'subcategory-1',
        name: 'Vehicle',
      },
    });
    expect(
      prisma.quality_classification_subcategories.findFirst,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: 'category-1',
          id: 'subcategory-1',
          category: {
            is: {
              scope: 'AFTER_SALES_PRODUCT',
              isDeleted: false,
              status: 1,
            },
          },
        }),
      }),
    );
  });

  it('rejects an inactive or mismatched selection', async () => {
    vi.mocked(
      prisma.quality_classification_subcategories.findFirst,
    ).mockResolvedValue(null);

    await expect(
      QualityClassificationService.assertSelection(
        'AFTER_SALES_DEFECT',
        'category-1',
        'subcategory-2',
      ),
    ).rejects.toMatchObject({
      code: 'QUALITY_CLASSIFICATION_SELECTION_INVALID',
    });
  });

  it('restores a deleted category without changing its stable code', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findMany,
    ).mockResolvedValue([
      { code: 'VEHICLE_PRODUCT', id: 'category-1', isDeleted: true },
    ] as never);
    vi.mocked(
      prisma.quality_classification_categories.update,
    ).mockResolvedValue({
      code: 'VEHICLE_PRODUCT',
      id: 'category-1',
      name: 'Vehicle products',
    } as never);

    const result = await QualityClassificationService.createCategory({
      name: 'Vehicle products',
      scope: 'AFTER_SALES_PRODUCT',
    });

    expect(result.id).toBe('category-1');
    expect(
      prisma.quality_classification_categories.create,
    ).not.toHaveBeenCalled();
    expect(
      prisma.quality_classification_categories.update,
    ).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      data: expect.objectContaining({ code: 'VEHICLE_PRODUCT' }),
    });
  });

  it('generates a stable code when a new category omits it', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findMany,
    ).mockResolvedValue([]);
    vi.mocked(
      prisma.quality_classification_categories.create,
    ).mockResolvedValue({ id: 'category-1' } as never);

    await QualityClassificationService.createCategory({
      name: 'Appearance',
      scope: 'INSPECTION_ISSUE_DEFECT',
    });

    expect(
      prisma.quality_classification_categories.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: expect.stringMatching(/^CATEGORY_[A-Z0-9]+$/),
      }),
    });
  });

  it('restores a subcategory only under its original parent', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findFirst,
    ).mockResolvedValue({ id: 'category-1' } as never);
    vi.mocked(
      prisma.quality_classification_subcategories.findMany,
    ).mockResolvedValue([
      { code: 'SCRATCH', id: 'subcategory-1', isDeleted: true },
    ] as never);
    vi.mocked(
      prisma.quality_classification_subcategories.update,
    ).mockResolvedValue({ id: 'subcategory-1' } as never);

    await QualityClassificationService.createSubcategory({
      categoryId: 'category-1',
      name: 'Scratch',
    });

    expect(
      prisma.quality_classification_subcategories.update,
    ).toHaveBeenCalledWith({
      where: { id: 'subcategory-1' },
      data: expect.objectContaining({
        categoryId: 'category-1',
        code: 'SCRATCH',
        isDeleted: false,
      }),
    });
  });

  it('looks up semantic categories by normalized stable code', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findFirst,
    ).mockResolvedValue({
      code: 'VEHICLE_PRODUCT',
      id: 'category-1',
      name: 'Vehicle product',
    } as never);

    await QualityClassificationService.findActiveCategoryByCode(
      'AFTER_SALES_PRODUCT',
      ' vehicle_product ',
    );

    expect(
      prisma.quality_classification_categories.findFirst,
    ).toHaveBeenCalledWith({
      where: {
        code: 'VEHICLE_PRODUCT',
        isDeleted: false,
        scope: 'AFTER_SALES_PRODUCT',
        status: 1,
      },
      select: { code: true, id: true, name: true },
    });
  });

  it('resolves historical category names in one scoped query', async () => {
    vi.mocked(
      prisma.quality_classification_categories.findMany,
    ).mockResolvedValue([
      { id: 'category-1', name: 'Vehicle product' },
      { id: 'category-2', name: 'Other product' },
    ] as never);

    const names = await QualityClassificationService.resolveCategoryNamesByIds(
      'AFTER_SALES_PRODUCT',
      ['category-1', 'category-2', 'category-1'],
    );

    expect(names).toEqual(
      new Map([
        ['category-1', 'Vehicle product'],
        ['category-2', 'Other product'],
      ]),
    );
    expect(
      prisma.quality_classification_categories.findMany,
    ).toHaveBeenCalledWith({
      where: {
        id: { in: ['category-1', 'category-2'] },
        scope: 'AFTER_SALES_PRODUCT',
      },
      select: { id: true, name: true },
    });
  });

  it('resolves historical subcategory names through their parent scope', async () => {
    vi.mocked(
      prisma.quality_classification_subcategories.findMany,
    ).mockResolvedValue([{ id: 'subcategory-1', name: 'Vehicle' }] as never);

    const names =
      await QualityClassificationService.resolveSubcategoryNamesByIds(
        'AFTER_SALES_PRODUCT',
        ['subcategory-1'],
      );

    expect(names).toEqual(new Map([['subcategory-1', 'Vehicle']]));
    expect(
      prisma.quality_classification_subcategories.findMany,
    ).toHaveBeenCalledWith({
      where: {
        id: { in: ['subcategory-1'] },
        category: { is: { scope: 'AFTER_SALES_PRODUCT' } },
      },
      select: { id: true, name: true },
    });
  });
});
