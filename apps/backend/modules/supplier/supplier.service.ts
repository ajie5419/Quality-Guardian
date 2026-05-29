import type { Prisma } from '@prisma/client';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { SupplierStats } from './supplier-scoring';

import { AfterSalesService } from '~/modules/after-sales';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { InspectionService } from '~/modules/inspection';
import {
  buildSupplierCreateDataWithCanonical,
  buildSupplierUpdateDataWithCanonical,
  buildSupplierUpsertPayload,
  DEFAULT_OUTSOURCING_MODE,
  normalizeOutsourcingMode,
  normalizeSupplierString,
} from '~/modules/supplier/supplier-query';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';

import {
  applyRecordsToStats,
  classifyDefect,
  createEmptyStats,
  scoreSupplierListItem,
} from './supplier-scoring';

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

interface SupplierListItem extends Record<string, unknown> {
  name: string;
  status: string;
  qualityScore: number;
  [key: string]: unknown;
}

const SUPPLIER_SORT_FIELDS: Record<
  string,
  Prisma.suppliersOrderByWithRelationInput
> = {
  category: { category: 'asc' },
  createdAt: { createdAt: 'asc' },
  email: { email: 'asc' },
  name: { name: 'asc' },
  phone: { phone: 'asc' },
  qualityScore: { qualityScore: 'asc' },
  rating: { rating: 'asc' },
  status: { status: 'asc' },
  updatedAt: { updatedAt: 'asc' },
};

function buildSupplierOrderBy(
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
): Prisma.suppliersOrderByWithRelationInput {
  const configured = sortBy ? SUPPLIER_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return { createdAt: 'desc' };
  const [field] = Object.keys(configured);
  return { [field]: sortOrder || 'asc' };
}

async function buildSupplierStatsMap(supplierNames: string[]) {
  const statsMap = new Map<string, SupplierStats>();
  if (supplierNames.length === 0) return statsMap;

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const supplierNameToId =
    await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
      configKey: 'supplierName',
      names: supplierNames,
    });
  const supplierIds = [...supplierNameToId.values()].filter(
    Boolean,
  ) as string[];
  const [inspectionScoring, afterSalesScoring] = await Promise.all([
    InspectionService.getSupplierScoringData({
      since: oneYearAgo,
      supplierIds,
      supplierNames,
    }),
    AfterSalesService.getSupplierScoringData({
      since: oneYearAgo,
      supplierNames,
    }),
  ]);
  const {
    incomingStats,
    engineeringStats,
    engineeringStatusStats,
    records: recentQualityRecords,
  } = inspectionScoring;
  const {
    stats: afterSalesStats,
    statusStats: afterSalesStatusStats,
    records: recentAfterSales,
  } = afterSalesScoring;

  incomingStats.forEach((s) => {
    if (s.supplierName) {
      const current = statsMap.get(s.supplierName) || createEmptyStats();
      current.count += s._count.id;
      current.quantity += s._sum.quantity || 0;
      if (s.result === 'PASS') {
        current.qualifiedCount += s._count.id;
      } else if (s.result === 'FAIL') {
        current.failures += s._count.id;
        current.failuresQuantity += s._sum.quantity || 0;
      }
      statsMap.set(s.supplierName, current);
    }
  });

  afterSalesStats.forEach((s) => {
    if (s.supplierBrand) {
      const current = statsMap.get(s.supplierBrand) || createEmptyStats();
      current.afterSalesLoss +=
        Number(s._sum.materialCost || 0) + Number(s._sum.laborTravelCost || 0);
      current.afterSalesCount += s._count.id;
      statsMap.set(s.supplierBrand, current);
    }
  });

  engineeringStats.forEach((s) => {
    if (s.supplierName) {
      const current = statsMap.get(s.supplierName) || createEmptyStats();
      current.engineeringLoss += Number(s._sum.lossAmount || 0);
      current.engineeringCount += s._count.id;
      current.engineeringDefectQuantity += s._sum.quantity || 0;
      statsMap.set(s.supplierName, current);
    }
  });

  engineeringStatusStats.forEach((s) => {
    if (!s.supplierName) return;
    if (s.status === 'CLOSED') return;
    const current = statsMap.get(s.supplierName) || createEmptyStats();
    current.openEngineeringCount += s._count.id;
    statsMap.set(s.supplierName, current);
  });

  afterSalesStatusStats.forEach((s) => {
    if (!s.supplierBrand) return;
    if (
      ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(s.claimStatus)
    ) {
      return;
    }
    const current = statsMap.get(s.supplierBrand) || createEmptyStats();
    current.openAfterSalesCount += s._count.id;
    statsMap.set(s.supplierBrand, current);
  });

  const supplierRecords: Record<
    string,
    Array<{
      date: Date;
      loss: number;
      origin: 'afterSales' | 'qualityRecords';
      type: 'A' | 'B' | 'C' | null;
    }>
  > = {};

  const combinedRecords = [
    ...recentAfterSales.map((r) => ({
      ...r,
      origin: 'afterSales' as const,
    })),
    ...recentQualityRecords.map((r) => ({
      ...r,
      origin: 'qualityRecords' as const,
    })),
  ];

  combinedRecords.forEach((r) => {
    const name = r.origin === 'afterSales' ? r.supplierBrand : r.supplierName;
    if (!name) return;

    let loss = 0;
    let date = new Date();
    if (r.origin === 'afterSales') {
      loss = Number(r.materialCost || 0) + Number(r.laborTravelCost || 0);
      date = new Date(r.occurDate);
    } else {
      loss = Number(r.lossAmount || 0);
      date = new Date(r.date);
    }

    const classification = classifyDefect(loss, r.severity || undefined);
    if (!supplierRecords[name]) supplierRecords[name] = [];
    supplierRecords[name].push({
      type: classification,
      loss,
      date,
      origin: r.origin,
    });
  });

  Object.entries(supplierRecords).forEach(([name, records]) => {
    const current = statsMap.get(name) || createEmptyStats();
    records.sort((a, b) => b.date.getTime() - a.date.getTime());
    statsMap.set(name, applyRecordsToStats(current, records));
  });

  return statsMap;
}

async function buildSupplierGlobalStats(
  scopedWhere: SupplierWhereInput,
  totalCount: number,
) {
  const [qualifiedCount, warningCount, averageScore] = await Promise.all([
    prisma.suppliers.count({
      where: { AND: [scopedWhere, { status: 'Qualified' }] },
    }),
    prisma.suppliers.count({
      where: {
        AND: [
          scopedWhere,
          {
            OR: [{ status: 'Observation' }, { qualityScore: { lt: 80 } }],
          },
        ],
      },
    }),
    prisma.suppliers.aggregate({
      where: scopedWhere,
      _avg: { qualityScore: true },
    }),
  ]);

  return {
    total: totalCount,
    qualified: qualifiedCount,
    warning: warningCount,
    avgScore: (averageScore._avg.qualityScore ?? 0).toFixed(1),
  };
}

export const SupplierService = {
  async createSupplier(payload: Record<string, unknown>) {
    const createData = await buildSupplierCreateDataWithCanonical(payload);
    if (!createData) return null;
    return prisma.suppliers.create({ data: createData });
  },

  async updateSupplier(id: string, payload: Record<string, unknown>) {
    return prisma.suppliers.update({
      where: { id },
      data: await buildSupplierUpdateDataWithCanonical(payload),
    });
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
            await prisma.suppliers.upsert({
              ...payload,
              create: { ...payload.create, ...createCanonicalIds },
              update: { ...payload.update, ...updateCanonicalIds },
            });
            results.success++;
          } catch {
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
        await prisma.suppliers.upsert({
          ...payload,
          create: { ...payload.create, ...createCanonicalIds },
          update: { ...payload.update, ...updateCanonicalIds },
        });
        successCount++;
      } catch {
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
        orderBy: buildSupplierOrderBy(sortBy, sortOrder),
        skip,
        take: safePageSize,
      }),
      prisma.suppliers.count({ where: scopedWhere }),
    ]);

    // 3. 安全的数据映射
    const listData = rawItems.map((item) => ({
      ...item,
      qualityScore: item.qualityScore ?? 100,
      level: item.rating || 'A',
      status: item.status || 'Qualified',
      createdAt:
        item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
      updatedAt:
        item.updatedAt instanceof Date ? item.updatedAt.toISOString() : null,
    }));

    // 4. Statistics Aggregation
    const supplierNames = listData.map((i) => i.name).filter(Boolean);
    const [statsMap, globalStats] = await Promise.all([
      buildSupplierStatsMap(supplierNames),
      buildSupplierGlobalStats(scopedWhere, totalCount),
    ]);

    // 5. [Process Current Page]
    const processedPageList = listData.map((item) =>
      scoreSupplierListItem(
        item,
        statsMap.get(item.name) || createEmptyStats(),
      ),
    );

    // 6. [Dynamic Sorting]
    if (sortBy && sortOrder && !SUPPLIER_SORT_FIELDS[sortBy]) {
      (processedPageList as SupplierListItem[]).sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];

        if (valA === valB) return 0;

        // Numeric comparison
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }

        // String comparison
        const strA = String(valA || '');
        const strB = String(valB || '');
        return sortOrder === 'asc'
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    return {
      items: processedPageList,
      total: totalCount,
      stats: globalStats,
    };
  },
};
