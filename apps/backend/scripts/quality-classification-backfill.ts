import type { QualityClassificationScope } from '@qgs/shared';

import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import prisma from '~/utils/prisma';

export type QualityClassificationBackfillMode = 'apply' | 'dry-run';

export interface QualityClassificationBackfillOptions {
  batchSize: number;
  mode: QualityClassificationBackfillMode;
}

interface ClassificationPair {
  categoryId: string;
  subcategoryId: string;
}

interface ClassificationIdentity {
  categoryId: null | string;
  categoryName: null | string;
  subcategoryId: null | string;
  subcategoryName: null | string;
}

interface BackfillSummary {
  conflicts: number;
  resolved: number;
  scanned: number;
  unresolved: number;
  updated: number;
}

const pairKey = (
  scope: QualityClassificationScope,
  categoryName: null | string,
  subcategoryName: null | string,
) =>
  `${scope}\u0000${categoryName?.trim() || ''}\u0000${subcategoryName?.trim() || ''}`;

export function parseQualityClassificationBackfillOptions(args: string[]) {
  let batchSize = 200;
  let mode: QualityClassificationBackfillMode = 'dry-run';
  for (const arg of args) {
    if (arg === '--apply') mode = 'apply';
    else if (arg === '--dry-run') mode = 'dry-run';
    else if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.slice('--batch-size='.length));
      if (!Number.isInteger(value) || value < 1 || value > 1000) {
        throw new Error('--batch-size must be an integer between 1 and 1000');
      }
      batchSize = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { batchSize, mode };
}

export function resolveClassificationPair(
  pairs: Map<string, ClassificationPair>,
  scope: QualityClassificationScope,
  identity: ClassificationIdentity,
) {
  if (!identity.categoryName?.trim() || !identity.subcategoryName?.trim()) {
    return { pair: null, reason: 'missing_classification_names' } as const;
  }
  const pair = pairs.get(
    pairKey(scope, identity.categoryName, identity.subcategoryName),
  );
  if (!pair) {
    return { pair: null, reason: 'classification_pair_not_found' } as const;
  }
  if (
    (identity.categoryId && identity.categoryId !== pair.categoryId) ||
    (identity.subcategoryId && identity.subcategoryId !== pair.subcategoryId)
  ) {
    return {
      pair: null,
      reason: 'existing_classification_id_conflict',
    } as const;
  }
  return { pair, reason: null } as const;
}

async function loadClassificationPairs() {
  const categories = await prisma.quality_classification_categories.findMany({
    where: { isDeleted: false },
    select: {
      id: true,
      name: true,
      scope: true,
      subcategories: {
        where: { isDeleted: false },
        select: { id: true, name: true },
      },
    },
  });
  return new Map(
    categories.flatMap((category) =>
      category.subcategories.map(
        (subcategory) =>
          [
            pairKey(category.scope, category.name, subcategory.name),
            {
              categoryId: category.id,
              subcategoryId: subcategory.id,
            },
          ] as const,
      ),
    ),
  );
}

async function persistAudit(input: {
  entityId: string;
  entityType: 'after_sales' | 'quality_records';
  fieldName: 'defectClassification' | 'productClassification';
  identity: ClassificationIdentity;
  mode: QualityClassificationBackfillMode;
  reason: string;
  scope: QualityClassificationScope;
}) {
  if (input.mode !== 'apply') return;
  await prisma.unresolved_master_data_refs.upsert({
    where: {
      entityType_entityId_fieldName: {
        entityId: input.entityId,
        entityType: input.entityType,
        fieldName: input.fieldName,
      },
    },
    create: {
      entityId: input.entityId,
      entityType: input.entityType,
      evidence: {
        categoryId: input.identity.categoryId,
        categoryName: input.identity.categoryName,
        scope: input.scope,
        subcategoryId: input.identity.subcategoryId,
        subcategoryName: input.identity.subcategoryName,
      },
      fieldName: input.fieldName,
      rawId:
        [input.identity.categoryId, input.identity.subcategoryId]
          .filter(Boolean)
          .join('/') || null,
      rawName:
        [input.identity.categoryName, input.identity.subcategoryName]
          .filter(Boolean)
          .join('/') || null,
      reason: input.reason,
    },
    update: {
      evidence: {
        categoryId: input.identity.categoryId,
        categoryName: input.identity.categoryName,
        scope: input.scope,
        subcategoryId: input.identity.subcategoryId,
        subcategoryName: input.identity.subcategoryName,
      },
      isDeleted: false,
      rawId:
        [input.identity.categoryId, input.identity.subcategoryId]
          .filter(Boolean)
          .join('/') || null,
      rawName:
        [input.identity.categoryName, input.identity.subcategoryName]
          .filter(Boolean)
          .join('/') || null,
      reason: input.reason,
      resolutionNote: null,
      resolvedAt: null,
      resolvedId: null,
      status: 'OPEN',
    },
  });
}

async function resolveAudit(input: {
  entityId: string;
  entityType: 'after_sales' | 'quality_records';
  fieldName: 'defectClassification' | 'productClassification';
  mode: QualityClassificationBackfillMode;
  resolvedId: string;
}) {
  if (input.mode !== 'apply') return;
  await prisma.unresolved_master_data_refs.updateMany({
    where: {
      entityId: input.entityId,
      entityType: input.entityType,
      fieldName: input.fieldName,
      isDeleted: false,
      status: 'OPEN',
    },
    data: {
      resolutionNote: 'Resolved by quality classification backfill',
      resolvedAt: new Date(),
      resolvedId: input.resolvedId,
      status: 'RESOLVED',
    },
  });
}

function createSummary(): BackfillSummary {
  return { conflicts: 0, resolved: 0, scanned: 0, unresolved: 0, updated: 0 };
}

async function handleIdentity(input: {
  entityId: string;
  entityType: 'after_sales' | 'quality_records';
  fieldName: 'defectClassification' | 'productClassification';
  identity: ClassificationIdentity;
  mode: QualityClassificationBackfillMode;
  pairs: Map<string, ClassificationPair>;
  scope: QualityClassificationScope;
  update: (pair: ClassificationPair) => Promise<number>;
}) {
  if (input.identity.categoryId && input.identity.subcategoryId) {
    return { conflict: false, resolved: false, unresolved: false, updated: 0 };
  }
  const candidate = resolveClassificationPair(
    input.pairs,
    input.scope,
    input.identity,
  );
  if (!candidate.pair) {
    await persistAudit({ ...input, reason: candidate.reason });
    return {
      conflict: candidate.reason === 'existing_classification_id_conflict',
      resolved: false,
      unresolved: true,
      updated: 0,
    };
  }
  const updated =
    input.mode === 'apply' ? await input.update(candidate.pair) : 1;
  if (updated > 0) {
    await resolveAudit({
      entityId: input.entityId,
      entityType: input.entityType,
      fieldName: input.fieldName,
      mode: input.mode,
      resolvedId: candidate.pair.subcategoryId,
    });
  }
  return {
    conflict: false,
    resolved: input.mode === 'dry-run' || updated > 0,
    unresolved: false,
    updated,
  };
}

function mergeResult(
  summary: BackfillSummary,
  result: Awaited<ReturnType<typeof handleIdentity>>,
) {
  summary.conflicts += result.conflict ? 1 : 0;
  summary.resolved += result.resolved ? 1 : 0;
  summary.unresolved += result.unresolved ? 1 : 0;
  summary.updated += result.updated;
}

async function backfillInspectionIssues(
  pairs: Map<string, ClassificationPair>,
  options: QualityClassificationBackfillOptions,
) {
  const summary = createSummary();
  let cursor = '';
  while (true) {
    const rows = await prisma.quality_records.findMany({
      where: {
        id: cursor ? { gt: cursor } : undefined,
        isDeleted: false,
        OR: [{ defectCategoryId: null }, { defectSubcategoryId: null }],
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        defectCategoryId: true,
        defectSubcategoryId: true,
        defectSubtype: true,
        defectType: true,
        id: true,
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      summary.scanned += 1;
      const identity = {
        categoryId: row.defectCategoryId,
        categoryName: row.defectType,
        subcategoryId: row.defectSubcategoryId,
        subcategoryName: row.defectSubtype,
      };
      mergeResult(
        summary,
        await handleIdentity({
          entityId: row.id,
          entityType: 'quality_records',
          fieldName: 'defectClassification',
          identity,
          mode: options.mode,
          pairs,
          scope: QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
          update: async (pair) => {
            const result = await prisma.quality_records.updateMany({
              where: {
                defectCategoryId: row.defectCategoryId,
                defectSubcategoryId: row.defectSubcategoryId,
                id: row.id,
                isDeleted: false,
              },
              data: {
                defectCategoryId: row.defectCategoryId ?? pair.categoryId,
                defectSubcategoryId:
                  row.defectSubcategoryId ?? pair.subcategoryId,
              },
            });
            return result.count;
          },
        }),
      );
    }
    cursor = rows.at(-1)?.id || '';
    if (rows.length < options.batchSize) break;
  }
  return summary;
}

async function backfillAfterSales(
  pairs: Map<string, ClassificationPair>,
  options: QualityClassificationBackfillOptions,
) {
  const summary = createSummary();
  let cursor = '';
  while (true) {
    const rows = await prisma.after_sales.findMany({
      where: {
        id: cursor ? { gt: cursor } : undefined,
        isDeleted: false,
        OR: [
          { defectCategoryId: null },
          { defectSubcategoryId: null },
          { productCategoryId: null },
          { productSubcategoryId: null },
        ],
      },
      orderBy: { id: 'asc' },
      take: options.batchSize,
      select: {
        defectCategoryId: true,
        defectSubcategoryId: true,
        defectSubtype: true,
        defectType: true,
        id: true,
        productCategoryId: true,
        productSubcategoryId: true,
        productSubtype: true,
        productType: true,
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      summary.scanned += 1;
      const defectIdentity = {
        categoryId: row.defectCategoryId,
        categoryName: row.defectType,
        subcategoryId: row.defectSubcategoryId,
        subcategoryName: row.defectSubtype,
      };
      mergeResult(
        summary,
        await handleIdentity({
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'defectClassification',
          identity: defectIdentity,
          mode: options.mode,
          pairs,
          scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT,
          update: async (pair) => {
            const result = await prisma.after_sales.updateMany({
              where: {
                defectCategoryId: row.defectCategoryId,
                defectSubcategoryId: row.defectSubcategoryId,
                id: row.id,
                isDeleted: false,
              },
              data: {
                defectCategoryId: row.defectCategoryId ?? pair.categoryId,
                defectSubcategoryId:
                  row.defectSubcategoryId ?? pair.subcategoryId,
              },
            });
            return result.count;
          },
        }),
      );
      const productIdentity = {
        categoryId: row.productCategoryId,
        categoryName: row.productType,
        subcategoryId: row.productSubcategoryId,
        subcategoryName: row.productSubtype,
      };
      mergeResult(
        summary,
        await handleIdentity({
          entityId: row.id,
          entityType: 'after_sales',
          fieldName: 'productClassification',
          identity: productIdentity,
          mode: options.mode,
          pairs,
          scope: QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT,
          update: async (pair) => {
            const result = await prisma.after_sales.updateMany({
              where: {
                id: row.id,
                isDeleted: false,
                productCategoryId: row.productCategoryId,
                productSubcategoryId: row.productSubcategoryId,
              },
              data: {
                productCategoryId: row.productCategoryId ?? pair.categoryId,
                productSubcategoryId:
                  row.productSubcategoryId ?? pair.subcategoryId,
              },
            });
            return result.count;
          },
        }),
      );
    }
    cursor = rows.at(-1)?.id || '';
    if (rows.length < options.batchSize) break;
  }
  return summary;
}

export async function backfillQualityClassifications(
  options: QualityClassificationBackfillOptions,
) {
  const pairs = await loadClassificationPairs();
  const [inspectionIssues, afterSales] = await Promise.all([
    backfillInspectionIssues(pairs, options),
    backfillAfterSales(pairs, options),
  ]);
  return { afterSales, inspectionIssues };
}
