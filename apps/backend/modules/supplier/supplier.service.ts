import type { Prisma } from '@prisma/client';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { FileStorageService } from '~/modules/file-storage';
import { InspectionService } from '~/modules/inspection';
import {
  buildSupplierCreateDataWithCanonical,
  buildSupplierUpdateDataWithCanonical,
  buildSupplierUpsertPayload,
  DEFAULT_OUTSOURCING_MODE,
  normalizeOutsourcingMode,
  normalizeSupplierString,
} from '~/modules/supplier/supplier-query';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';

import { SupplierScoreSnapshotService } from './supplier-score-snapshot.service';

const logger = createModuleLogger('supplier-service');

export interface SupplierQueryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  status?: string;
  keyword?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  name?: string;
  outsourcingMode?: string;
  userContext?: { userId: string; username?: string };
  dataScope?: ResolvedDataScope;
}

type SupplierWhereInput = Prisma.suppliersWhereInput;
type SupplierAdmissionPayload = Record<string, unknown>;

const SUPPLIER_SORT_FIELDS: Record<
  string,
  Prisma.suppliersOrderByWithRelationInput
> = {
  brand: { brand: 'asc' },
  buyer: { buyer: 'asc' },
  category: { category: 'asc' },
  createdAt: { createdAt: 'asc' },
  email: { email: 'asc' },
  manufacturerNature: { manufacturerNature: 'asc' },
  name: { name: 'asc' },
  phone: { phone: 'asc' },
  productName: { productName: 'asc' },
  recognizedAt: { recognizedAt: 'asc' },
  outsourcingMode: { outsourcingMode: 'asc' },
  updatedAt: { updatedAt: 'asc' },
};

const SUPPLIER_SNAPSHOT_SORT_FIELDS: Record<string, string> = {
  afterSalesIssueCount: 'afterSalesIssueCount',
  engineeringIssueCount: 'engineeringIssueCount',
  incomingQualifiedRate: 'incomingQualifiedRate',
  level: 'finalRating',
  qualityScore: 'finalQualityScore',
  rating: 'finalRating',
  status: 'finalStatus',
};

function buildSupplierOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): Prisma.suppliersOrderByWithRelationInput[] {
  const snapshotField = sortBy
    ? SUPPLIER_SNAPSHOT_SORT_FIELDS[sortBy]
    : undefined;
  if (snapshotField) {
    return [
      {
        scoreSnapshot: {
          [snapshotField]: sortOrder,
        },
      } as Prisma.suppliersOrderByWithRelationInput,
      { createdAt: 'desc' },
    ];
  }
  const configured = sortBy ? SUPPLIER_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return [{ createdAt: 'desc' }];
  const [field] = Object.keys(configured);
  return [{ [field]: sortOrder }, { createdAt: 'desc' }];
}

function mapSupplierListItem(
  item: Prisma.suppliersGetPayload<{ include: { scoreSnapshot: true } }>,
) {
  const snapshot = item.scoreSnapshot;
  return {
    ...item,
    afterSalesIssueCount: snapshot?.afterSalesIssueCount ?? 0,
    afterSalesScore: snapshot?.afterSalesScore ?? 100,
    engineeringIssueCount: snapshot?.engineeringIssueCount ?? 0,
    engineeringScore: snapshot?.engineeringScore ?? 100,
    incomingBatchCount: snapshot?.incomingBatchCount ?? 0,
    incomingQualifiedRate: snapshot?.incomingQualifiedRate ?? 100,
    incomingScore: snapshot?.incomingScore ?? 100,
    incomingTotalQuantity: snapshot?.incomingTotalQuantity ?? 0,
    isWarning: snapshot?.isWarning ?? false,
    level: snapshot?.finalRating || item.rating || 'A',
    outsourcingMode: snapshot?.outsourcingMode || item.outsourcingMode,
    qualityScore: snapshot?.finalQualityScore ?? item.qualityScore ?? 100,
    rating: snapshot?.finalRating || item.rating || 'A',
    scoringModel: snapshot?.scoringModel || 'SUPPLIER',
    stabilityScore: snapshot?.stabilityScore ?? 100,
    status: snapshot?.finalStatus || item.status || 'Qualified',
    totalAfterSalesLoss: snapshot?.totalAfterSalesLoss ?? 0,
    totalEngineeringLoss: snapshot?.totalEngineeringLoss ?? 0,
    warningReasons: snapshot?.warningReasons || [],
    createdAt:
      item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
    recognizedAt:
      item.recognizedAt instanceof Date
        ? item.recognizedAt.toISOString()
        : null,
    updatedAt:
      item.updatedAt instanceof Date ? item.updatedAt.toISOString() : null,
  };
}

async function registerAdmissionDocuments(
  supplierId: string,
  payload: SupplierAdmissionPayload,
) {
  if (!Object.hasOwn(payload, 'admissionDocuments')) return;
  await FileStorageService.registerReferencesFromAttachments({
    attachments: payload.admissionDocuments,
    bizId: supplierId,
    bizType: 'supplier',
    fieldName: 'admissionDocuments',
  });
}

async function buildSupplierGlobalStats(
  scopedWhere: SupplierWhereInput,
  totalCount: number,
) {
  const [qualifiedCount, warningCount, averageScore] = await Promise.all([
    prisma.suppliers.count({
      where: {
        AND: [
          scopedWhere,
          { scoreSnapshot: { is: { finalStatus: 'Qualified' } } },
        ],
      },
    }),
    prisma.suppliers.count({
      where: {
        AND: [
          scopedWhere,
          {
            OR: [
              { scoreSnapshot: { is: { finalStatus: 'Observation' } } },
              { scoreSnapshot: { is: { finalStatus: 'Frozen' } } },
              { scoreSnapshot: { is: { finalQualityScore: { lt: 80 } } } },
            ],
          },
        ],
      },
    }),
    prisma.supplier_score_snapshots.aggregate({
      where: {
        supplier: { is: scopedWhere },
        isDeleted: false,
      },
      _avg: { finalQualityScore: true },
    }),
  ]);

  return {
    total: totalCount,
    qualified: qualifiedCount,
    warning: warningCount,
    avgScore: (averageScore._avg.finalQualityScore ?? 0).toFixed(1),
  };
}

export const SupplierService = {
  async createSupplier(payload: Record<string, unknown>) {
    const createData = await buildSupplierCreateDataWithCanonical(payload);
    if (!createData) return null;
    const created = await prisma.suppliers.create({ data: createData });
    await registerAdmissionDocuments(created.id, payload);
    await SupplierScoreSnapshotService.refreshSuppliers([created]);
    return created;
  },

  async updateSupplier(id: string, payload: Record<string, unknown>) {
    const updated = await prisma.suppliers.update({
      where: { id },
      data: await buildSupplierUpdateDataWithCanonical(payload),
    });
    await registerAdmissionDocuments(updated.id, payload);
    await SupplierScoreSnapshotService.refreshSuppliers([updated]);
    return updated;
  },

  async deleteSupplier(id: string) {
    return prisma.suppliers.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  },

  async batchDeleteSuppliers(ids: string[]) {
    return prisma.suppliers.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  },

  async batchUpsertSuppliers(items: Array<Record<string, unknown>>) {
    const results = { errors: 0, skipped: 0, success: 0 };
    const chunkSize = 20;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (item) => {
          const payload = buildSupplierUpsertPayload(item);
          if (!payload) {
            results.skipped++;
            return;
          }
          try {
            const createCanonicalIds =
              await buildGovernedCanonicalWritePairForTable(
                'suppliers',
                payload.create,
              );
            const updateCanonicalIds =
              await buildGovernedCanonicalWritePairForTable(
                'suppliers',
                payload.update,
              );
            const supplier = await prisma.suppliers.upsert({
              ...payload,
              create: { ...payload.create, ...createCanonicalIds },
              update: { ...payload.update, ...updateCanonicalIds },
            });
            await SupplierScoreSnapshotService.refreshSuppliers([supplier]);
            results.success++;
          } catch (error) {
            logger.error(error, 'batchUpsertSuppliers: failed to upsert row');
            results.errors++;
          }
        }),
      );
    }
    return results;
  },

  async importSuppliers(
    items: Array<Record<string, unknown>>,
    category?: unknown,
  ) {
    const normalizedCategory = normalizeSupplierString(category);
    let successCount = 0;
    for (const item of items) {
      const payload = buildSupplierUpsertPayload(item, {
        category: normalizedCategory,
      });
      if (!payload) continue;
      try {
        const createCanonicalIds =
          await buildGovernedCanonicalWritePairForTable(
            'suppliers',
            payload.create,
          );
        const updateCanonicalIds =
          await buildGovernedCanonicalWritePairForTable(
            'suppliers',
            payload.update,
          );
        const supplier = await prisma.suppliers.upsert({
          ...payload,
          create: { ...payload.create, ...createCanonicalIds },
          update: { ...payload.update, ...updateCanonicalIds },
        });
        await SupplierScoreSnapshotService.refreshSuppliers([supplier]);
        successCount++;
      } catch (error) {
        logger.error(error, 'importSuppliers: failed to upsert row; skipping');
        // keep import behavior: ignore row-level failures
      }
    }
    return { successCount, totalCount: items.length };
  },

  /**
   * Find all suppliers with advanced filtering, scoring, and aggregation
   */
  async findAll(params: SupplierQueryParams) {
    const {
      page = 1,
      pageSize = 20,
      category,
      status,
      keyword,
      sortBy,
      sortOrder,
      outsourcingMode,
    } = params;

    const safePage = Math.max(Number(page) || 1, 1);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const skip = (safePage - 1) * safePageSize;

    // 1. 构造极其稳健的过滤条件
    const where: SupplierWhereInput = { isDeleted: false };
    if (category) {
      const cat = category.toLowerCase();
      if (cat === 'supplier' || cat === 'productionunit') {
        where.NOT = { category: { contains: 'Outsourcing' } };
      } else if (cat === 'outsourcing') {
        where.category = { contains: 'Outsourcing' };
      } else {
        where.category = { contains: category };
      }
    }
    if (status) where.status = status;
    const keywordOr = buildKeywordOr(keyword, [
      'name',
      'contact',
      'email',
      'phone',
    ] as const);
    if (keywordOr) Object.assign(where, keywordOr);
    const normalizedOutsourcingMode = normalizeOutsourcingMode(
      outsourcingMode,
      category,
    );
    if (normalizedOutsourcingMode && outsourcingMode) {
      if (normalizedOutsourcingMode === DEFAULT_OUTSOURCING_MODE) {
        where.AND = [
          ...((Array.isArray(where.AND)
            ? where.AND
            : []) as SupplierWhereInput[]),
          {
            OR: [
              { outsourcingMode: normalizedOutsourcingMode },
              { outsourcingMode: null },
            ],
          },
        ];
      } else {
        where.outsourcingMode = normalizedOutsourcingMode;
      }
    }

    const scopedWhere = params.userContext?.userId
      ? await DataScopeService.buildSupplierWhere(
          where,
          {
            userId: params.userContext.userId,
            username: params.userContext.username,
          },
          params.dataScope,
        )
      : where;

    // 2. 执行核心查询
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: scopedWhere,
        include: { scoreSnapshot: true },
        orderBy: buildSupplierOrderBy(sortBy, sortOrder),
        skip,
        take: safePageSize,
      }),
      prisma.suppliers.count({ where: scopedWhere }),
    ]);

    const globalStats = await buildSupplierGlobalStats(scopedWhere, totalCount);

    return {
      items: rawItems.map((item) => mapSupplierListItem(item)),
      total: totalCount,
      stats: globalStats,
    };
  },

  async getHistoryProjects(id: string) {
    const supplier = await prisma.suppliers.findFirst({
      select: { id: true, name: true, nameId: true },
      where: { id, isDeleted: false },
    });
    if (!supplier) return null;

    return InspectionService.getSupplierHistoryProjects({
      supplierName: supplier.name,
      supplierNameId: supplier.nameId,
    });
  },
};
