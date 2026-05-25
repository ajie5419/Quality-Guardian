import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { MasterDataGovernanceKernel } from '~/utils/master-data-governance-kernel';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import {
  applyRecordsToStats,
  classifyDefect,
  createEmptyStats,
  scoreSupplierListItem,
  type SupplierStats,
} from './supplier-scoring';
import {
  buildSupplierCreateDataWithCanonical,
  buildSupplierUpdateDataWithCanonical,
  buildSupplierUpsertPayload,
  DEFAULT_OUTSOURCING_MODE,
  IN_HOUSE_OUTSOURCING_MODE,
  isOutsourcingCategory,
  normalizeOutsourcingMode,
  normalizeSupplierString,
} from '~/utils/supplier';

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

    // 1. 构造极其稳健的过滤条件
    const where: Record<string, unknown> = { isDeleted: false };
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
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { contact: { contains: keyword } },
        { email: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    const normalizedOutsourcingMode = normalizeOutsourcingMode(
      outsourcingMode,
      category,
    );
    if (normalizedOutsourcingMode && outsourcingMode) {
      if (normalizedOutsourcingMode === DEFAULT_OUTSOURCING_MODE) {
        where.AND = [
          ...((where.AND as unknown[]) || []),
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
      ? await DataScopeService.buildSupplierWhere(where, {
          userId: params.userContext.userId,
          username: params.userContext.username,
        })
      : where;

    // 2. 执行核心查询
    const [rawItems, totalCount] = await Promise.all([
      prisma.suppliers.findMany({
        where: scopedWhere,
        orderBy: { createdAt: 'desc' },
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
    // Get ALL supplier names to calculate global stats
    const supplierNames = listData.map((i) => i.name).filter(Boolean);
    const statsMap = new Map<string, SupplierStats>();

    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

    if (supplierNames.length > 0) {
      const supplierNameToId =
        await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
          configKey: 'supplierName',
          names: supplierNames,
        });
      const supplierIds = [...supplierNameToId.values()].filter(
        Boolean,
      ) as string[];
      const supplierWhereOr =
        supplierIds.length > 0
          ? [
              // governance-allow-direct-name-id: read-side compatibility filter keeps legacy name branch + canonical id branch.
              { supplierName: { in: supplierNames } },
              { supplierId: { in: supplierIds } },
            ]
          : [
              // governance-allow-direct-name-id: fallback branch for rows not yet fully canonicalized.
              { supplierName: { in: supplierNames } },
            ];
      const resolveCanonicalSupplierWhere = supplierWhereOr;

      const [
        incomingStats,
        afterSalesStats,
        engineeringStats,
        engineeringStatusStats,
        afterSalesStatusStats,
        recentAfterSales,
        recentQualityRecords,
      ] = await Promise.all([
        prisma.inspections.groupBy({
          by: ['supplierName', 'result'],
          where: {
            OR: supplierWhereOr,
            category: 'INCOMING',
            isDeleted: false,
            inspectionDate: { gte: oneYearAgo },
          },
          _count: { id: true },
          _sum: { quantity: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand'],
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          _sum: { materialCost: true, laborTravelCost: true },
          _count: { id: true },
        }),
        prisma.quality_records.groupBy({
          by: ['supplierName'],
          where: {
            OR: supplierWhereOr,
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          _sum: { lossAmount: true, quantity: true },
          _count: { id: true },
        }),
        prisma.quality_records.groupBy({
          by: ['supplierName', 'status'],
          where: {
            OR: supplierWhereOr,
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand', 'claimStatus'],
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          _count: { id: true },
        }),
        prisma.after_sales.findMany({
          where: {
            supplierBrand: { in: supplierNames },
            isDeleted: false,
            occurDate: { gte: oneYearAgo },
          },
          select: {
            supplierBrand: true,
            materialCost: true,
            laborTravelCost: true,
            severity: true,
            occurDate: true,
          },
          orderBy: { occurDate: 'desc' },
        }),
        prisma.quality_records.findMany({
          where: {
            OR: resolveCanonicalSupplierWhere,
            isDeleted: false,
            date: { gte: oneYearAgo },
          },
          select: {
            supplierName: true,
            lossAmount: true,
            severity: true,
            date: true,
          },
          orderBy: { date: 'desc' },
        }),
      ]);

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
            Number(s._sum.materialCost || 0) +
            Number(s._sum.laborTravelCost || 0);
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
          ['CANCELLED', 'CLOSED', 'COMPLETED', 'RESOLVED'].includes(
            s.claimStatus,
          )
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
        const name =
          r.origin === 'afterSales' ? r.supplierBrand : r.supplierName;
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
    }

    // 5. [Process FULL List for Global Stats]
    const processedFullList = listData.map((item) =>
      scoreSupplierListItem(item, statsMap.get(item.name) || createEmptyStats()),
    );

    interface SupplierListItem extends Record<string, unknown> {
      name: string;
      status: string;
      qualityScore: number;
      [key: string]: unknown;
    }

    // 6. [Dynamic Sorting]
    if (sortBy && sortOrder) {
      (processedFullList as SupplierListItem[]).sort((a, b) => {
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

    // 7. Global Aggregation
    const globalStats = {
      total: totalCount,
      qualified: processedFullList.filter((s) => s.status === 'Qualified')
        .length,
      warning: processedFullList.filter(
        (s) => s.qualityScore < 80 || s.status === 'Observation',
      ).length,
      avgScore: (
        processedFullList.reduce((sum, i) => sum + i.qualityScore, 0) /
        (processedFullList.length || 1)
      ).toFixed(1),
    };

    // 8. Final Pagination
    const finalItems = processedFullList.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    return {
      items: finalItems,
      total: totalCount,
      stats: globalStats,
    };
  },
};
