import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

import { buildSupplierEngineeringIssueWhere } from './inspection-supplier-profile';

/**
 * 检验域评分/聚合数据（按数据源归属留在 inspection 模块）：
 * - getSupplierScoringData：按供应商/团队维度的检验评分数据（消费者：supplier 评分快照、after-sales）
 * - getWelderScoreStats：按焊工维度的检验记录聚合（消费者：welder 评分刷新）
 * - getWorkOrderAggregateInspections：工单下的检验明细（消费者：work-order 聚合）
 * 从 inspection-reporting.service.ts 拆出，避免报表聚合中心文件膨胀（阶段 4）。
 */
export const InspectionScoreDataService = {
  async getSupplierScoringData(params: {
    engineeringSupplierIds: string[];
    incomingSupplierIds: string[];
    processTeamIds: string[];
    since: Date;
  }) {
    const recentEngineeringWhere = buildSupplierEngineeringIssueWhere({
      since: params.since,
      supplierIds: params.engineeringSupplierIds,
    });
    const allEngineeringWhere = buildSupplierEngineeringIssueWhere({
      supplierIds: params.engineeringSupplierIds,
    });
    const inspectionSourceOr: Prisma.inspectionsWhereInput[] = [];
    if (params.incomingSupplierIds.length > 0) {
      inspectionSourceOr.push({
        category: 'INCOMING',
        supplierId: { in: params.incomingSupplierIds },
      });
    }
    if (params.processTeamIds.length > 0) {
      inspectionSourceOr.push({
        category: 'PROCESS',
        teamId: { in: params.processTeamIds },
      });
    }

    const [
      incomingStats,
      engineeringStats,
      engineeringStatusStats,
      records,
      engineeringTotalStats,
    ] = await Promise.all([
      prisma.inspections.groupBy({
        by: ['category', 'supplierId', 'teamId', 'result'],
        where: {
          OR: inspectionSourceOr,
          isDeleted: false,
          inspectionDate: { gte: params.since },
        },
        _count: { id: true },
        _sum: { quantity: true },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId'],
        where: recentEngineeringWhere,
        _sum: { lossAmount: true, quantity: true },
        _count: { id: true },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId', 'status'],
        where: recentEngineeringWhere,
        _count: { id: true },
      }),
      prisma.quality_records.findMany({
        where: recentEngineeringWhere,
        select: {
          supplierId: true,
          supplierName: true,
          lossAmount: true,
          severity: true,
          date: true,
        },
        orderBy: { date: 'desc' },
      }),
      prisma.quality_records.groupBy({
        by: ['supplierId'],
        where: allEngineeringWhere,
        _count: { id: true },
      }),
    ]);

    return {
      engineeringStats,
      engineeringStatusStats,
      engineeringTotalStats,
      incomingStats,
      records,
    };
  },

  async getWelderScoreStats(options?: {
    welderIds?: string[];
    welderNames?: string[];
  }) {
    const welderIds = [
      ...new Set(
        (options?.welderIds ?? [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    ];
    const welderNames = [
      ...new Set(
        (options?.welderNames ?? [])
          .map((name) => String(name || '').trim())
          .filter(Boolean),
      ),
    ];
    const idFilter = welderIds.length > 0;
    const nameFilter = welderNames.length > 0;
    if (!idFilter && !nameFilter) {
      return prisma.quality_records.groupBy({
        by: ['responsibleWelderId', 'responsibleWelder', 'severity'],
        where: { isDeleted: false },
        _count: { id: true },
      });
    }
    const orFilters: Prisma.quality_recordsWhereInput[] = [];
    if (idFilter) {
      orFilters.push({ responsibleWelderId: { in: welderIds } });
    }
    if (nameFilter) {
      // Historical rows without a canonical id fall back to exact name
      // matching; ambiguous names are ignored by the resolver later.
      orFilters.push({
        responsibleWelderId: null,
        responsibleWelder: { in: welderNames },
      });
    }
    return prisma.quality_records.groupBy({
      by: ['responsibleWelderId', 'responsibleWelder', 'severity'],
      where: { isDeleted: false, OR: orFilters },
      _count: { id: true },
    });
  },

  async getWorkOrderAggregateInspections(workOrderNumber: string) {
    return prisma.inspections.findMany({
      where: { isDeleted: false, workOrderNumber },
      orderBy: [{ inspectionDate: 'desc' }],
      include: {
        items: {
          orderBy: [{ order: 'asc' }],
          select: { checkItem: true, result: true },
        },
        process: { select: { name: true } },
      },
    });
  },
};
