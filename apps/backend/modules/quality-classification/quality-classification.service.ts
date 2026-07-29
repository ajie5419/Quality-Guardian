import type {
  QualityClassificationScope,
  QualityClassificationSelection,
} from '@qgs/shared';

import type {
  QualityClassificationCategoryCreateInput,
  QualityClassificationCategoryUpdateInput,
  QualityClassificationSubcategoryCreateInput,
  QualityClassificationSubcategoryUpdateInput,
} from './quality-classification.schema';

import { createId } from '@paralleldrive/cuid2';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

function normalizeCode(value: null | string | undefined) {
  return value?.trim().toUpperCase() || null;
}

function createStableCode(prefix: 'CATEGORY' | 'SUBCATEGORY') {
  return `${prefix}_${createId().toUpperCase()}`;
}

function conflict(entity: 'category' | 'subcategory'): never {
  throw new BusinessError(
    `QUALITY_CLASSIFICATION_${entity.toUpperCase()}_CONFLICT`,
    `A ${entity} with this code or name already exists`,
    409,
  );
}

function notFound(entity: 'category' | 'subcategory'): never {
  throw new BusinessError(
    `QUALITY_CLASSIFICATION_${entity.toUpperCase()}_NOT_FOUND`,
    `Quality classification ${entity} not found`,
    404,
  );
}

function toStatus(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

function toSelection(row: {
  category: { code: string; id: string; name: string };
  code: string;
  id: string;
  name: string;
}): QualityClassificationSelection {
  return {
    category: row.category,
    subcategory: {
      code: row.code,
      id: row.id,
      name: row.name,
    },
  };
}

async function findCategoryCandidates(
  input: QualityClassificationCategoryCreateInput,
  code: null | string,
) {
  return prisma.quality_classification_categories.findMany({
    where: {
      scope: input.scope,
      OR: [{ name: input.name.trim() }, ...(code ? [{ code }] : [])],
    },
    select: { code: true, id: true, isDeleted: true },
  });
}

async function findSubcategoryCandidates(
  input: QualityClassificationSubcategoryCreateInput,
  code: null | string,
) {
  return prisma.quality_classification_subcategories.findMany({
    where: {
      categoryId: input.categoryId,
      OR: [{ name: input.name.trim() }, ...(code ? [{ code }] : [])],
    },
    select: { code: true, id: true, isDeleted: true },
  });
}

async function assertCategoryNameAvailable(
  scope: QualityClassificationScope,
  name: string,
  excludedId: string,
) {
  const existing = await prisma.quality_classification_categories.findFirst({
    where: { scope, name, id: { not: excludedId } },
    select: { id: true },
  });
  if (existing) conflict('category');
}

async function assertSubcategoryNameAvailable(
  categoryId: string,
  name: string,
  excludedId: string,
) {
  const existing = await prisma.quality_classification_subcategories.findFirst({
    where: { categoryId, name, id: { not: excludedId } },
    select: { id: true },
  });
  if (existing) conflict('subcategory');
}

export const QualityClassificationService = {
  async listForManagement(scope: QualityClassificationScope) {
    const categories = await prisma.quality_classification_categories.findMany({
      where: { scope, isDeleted: false },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        code: true,
        id: true,
        name: true,
        scope: true,
        sort: true,
        status: true,
        subcategories: {
          where: { isDeleted: false },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }],
          select: {
            code: true,
            id: true,
            name: true,
            sort: true,
            status: true,
          },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      status: toStatus(category.status),
      subcategories: category.subcategories.map((subcategory) => ({
        ...subcategory,
        status: toStatus(subcategory.status),
      })),
    }));
  },

  async listActiveTree(scope: QualityClassificationScope) {
    const categories = await prisma.quality_classification_categories.findMany({
      where: { scope, isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        code: true,
        id: true,
        name: true,
        scope: true,
        sort: true,
        status: true,
        subcategories: {
          where: { isDeleted: false, status: 1 },
          orderBy: [{ sort: 'asc' }, { name: 'asc' }],
          select: {
            code: true,
            id: true,
            name: true,
            sort: true,
            status: true,
          },
        },
      },
    });

    return categories.map((category) => ({
      ...category,
      status: toStatus(category.status),
      subcategories: category.subcategories.map((subcategory) => ({
        ...subcategory,
        status: toStatus(subcategory.status),
      })),
    }));
  },

  async assertSelection(
    scope: QualityClassificationScope,
    categoryId: string,
    subcategoryId: string,
  ): Promise<QualityClassificationSelection> {
    const row = await prisma.quality_classification_subcategories.findFirst({
      where: {
        categoryId,
        id: subcategoryId,
        isDeleted: false,
        status: 1,
        category: {
          is: { scope, isDeleted: false, status: 1 },
        },
      },
      select: {
        category: { select: { code: true, id: true, name: true } },
        code: true,
        id: true,
        name: true,
      },
    });
    if (!row) {
      throw new BusinessError(
        'QUALITY_CLASSIFICATION_SELECTION_INVALID',
        'The selected category and subcategory are not available',
        400,
      );
    }
    return toSelection(row);
  },

  async findActiveCategoryByCode(
    scope: QualityClassificationScope,
    code: string,
  ) {
    return prisma.quality_classification_categories.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        isDeleted: false,
        scope,
        status: 1,
      },
      select: { code: true, id: true, name: true },
    });
  },

  async findHistoricalCategoryByCode(
    scope: QualityClassificationScope,
    code: string,
  ) {
    return prisma.quality_classification_categories.findFirst({
      where: {
        code: code.trim().toUpperCase(),
        scope,
      },
      select: { code: true, id: true, name: true },
    });
  },

  async resolveCategoryNamesByIds(
    scope: QualityClassificationScope,
    ids: string[],
  ) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map<string, string>();
    const rows = await prisma.quality_classification_categories.findMany({
      where: { id: { in: uniqueIds }, scope },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },

  async resolveSubcategoryNamesByIds(
    scope: QualityClassificationScope,
    ids: string[],
  ) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return new Map<string, string>();
    const rows = await prisma.quality_classification_subcategories.findMany({
      where: {
        id: { in: uniqueIds },
        category: { is: { scope } },
      },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },

  async resolveActiveSelectionByNames(
    scope: QualityClassificationScope,
    categoryName: string,
    subcategoryName: string,
  ): Promise<QualityClassificationSelection> {
    const row = await prisma.quality_classification_subcategories.findFirst({
      where: {
        name: subcategoryName.trim(),
        isDeleted: false,
        status: 1,
        category: {
          is: {
            name: categoryName.trim(),
            scope,
            isDeleted: false,
            status: 1,
          },
        },
      },
      select: {
        category: { select: { code: true, id: true, name: true } },
        code: true,
        id: true,
        name: true,
      },
    });
    if (!row) {
      throw new BusinessError(
        'QUALITY_CLASSIFICATION_NAME_NOT_FOUND',
        'The category and subcategory names do not match an active selection',
        400,
      );
    }
    return toSelection(row);
  },

  async createCategory(input: QualityClassificationCategoryCreateInput) {
    const code = normalizeCode(input.code);
    const existing = await findCategoryCandidates(input, code);
    if (existing.length > 1 || existing.some((item) => !item.isDeleted)) {
      conflict('category');
    }
    const deleted = existing[0];
    if (deleted && code && deleted.code !== code) conflict('category');
    const data = {
      code: deleted?.code ?? code ?? createStableCode('CATEGORY'),
      isDeleted: false,
      name: input.name.trim(),
      scope: input.scope,
      sort: input.sort ?? 0,
      status: input.status ?? 1,
    };
    if (deleted) {
      return prisma.quality_classification_categories.update({
        where: { id: deleted.id },
        data,
      });
    }
    return prisma.quality_classification_categories.create({ data });
  },

  async updateCategory(
    id: string,
    input: QualityClassificationCategoryUpdateInput,
  ) {
    const existing = await prisma.quality_classification_categories.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, scope: true },
    });
    if (!existing) notFound('category');
    const name = input.name?.trim();
    if (name) {
      await assertCategoryNameAvailable(existing.scope, name, existing.id);
    }
    return prisma.quality_classification_categories.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(input.sort === undefined ? {} : { sort: input.sort }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
    });
  },

  async removeCategory(id: string) {
    const result = await prisma.quality_classification_categories.updateMany({
      where: { id, isDeleted: false },
      data: { isDeleted: true, status: 0 },
    });
    if (result.count === 0) notFound('category');
  },

  async createSubcategory(input: QualityClassificationSubcategoryCreateInput) {
    const parent = await prisma.quality_classification_categories.findFirst({
      where: { id: input.categoryId, isDeleted: false },
      select: { id: true },
    });
    if (!parent) notFound('category');
    const code = normalizeCode(input.code);
    const existing = await findSubcategoryCandidates(input, code);
    if (existing.length > 1 || existing.some((item) => !item.isDeleted)) {
      conflict('subcategory');
    }
    const deleted = existing[0];
    if (deleted && code && deleted.code !== code) conflict('subcategory');
    const data = {
      categoryId: parent.id,
      code: deleted?.code ?? code ?? createStableCode('SUBCATEGORY'),
      isDeleted: false,
      name: input.name.trim(),
      sort: input.sort ?? 0,
      status: input.status ?? 1,
    };
    if (deleted) {
      return prisma.quality_classification_subcategories.update({
        where: { id: deleted.id },
        data,
      });
    }
    return prisma.quality_classification_subcategories.create({ data });
  },

  async updateSubcategory(
    id: string,
    input: QualityClassificationSubcategoryUpdateInput,
  ) {
    const existing =
      await prisma.quality_classification_subcategories.findFirst({
        where: { id, isDeleted: false },
        select: { categoryId: true, id: true },
      });
    if (!existing) notFound('subcategory');
    const name = input.name?.trim();
    if (name) {
      await assertSubcategoryNameAvailable(
        existing.categoryId,
        name,
        existing.id,
      );
    }
    return prisma.quality_classification_subcategories.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(input.sort === undefined ? {} : { sort: input.sort }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
    });
  },

  async removeSubcategory(id: string) {
    const result = await prisma.quality_classification_subcategories.updateMany(
      {
        where: { id, isDeleted: false },
        data: { isDeleted: true, status: 0 },
      },
    );
    if (result.count === 0) notFound('subcategory');
  },
};
