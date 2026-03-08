import type {
  AfterSalesItem,
  AfterSalesParams,
  AfterSalesStats,
} from '@qgs/shared';
import type { AfterSalesDateMode } from '~/utils/after-sales-query';

import { Prisma } from '@prisma/client';
import {
  formatDate,
  QMS_DEFAULT_VALUES,
  QMS_STATUS_OPEN_SET,
  tryParsePhotos,
} from '@qgs/shared';
import { buildAfterSalesDateRange } from '~/utils/after-sales-query';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

import { DataScopeService } from './data-scope.service';
import { SystemLogService } from './system-log.service';

// 创建模块级 logger
const logger = createModuleLogger('AfterSalesService');

export const AfterSalesService = {
  /**
   * Calculate After-Sales KPI and Statistics
   */
  async getStats(params?: {
    dateMode?: AfterSalesDateMode;
    dateValue?: string;
    year?: number;
  }): Promise<AfterSalesStats> {
    const { start: startDate, end } = buildAfterSalesDateRange({
      dateMode: params?.dateMode,
      dateValue: params?.dateValue,
      year: params?.year,
    });
    const endDate = new Date(end.getTime() - 1);
    const isYearMode = (params?.dateMode || 'year') === 'year';
    const months = isYearMode
      ? Array.from(
          { length: endDate.getMonth() - startDate.getMonth() + 1 },
          (_, i) => `${startDate.getMonth() + i + 1}月`,
        )
      : Array.from(
          {
            length: Math.max(
              1,
              Math.round((end.getTime() - startDate.getTime()) / 86_400_000),
            ),
          },
          (_, i) => {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            return `${date.getMonth() + 1}-${date.getDate()}`;
          },
        );
    const baseWhere = {
      isDeleted: false,
      occurDate: { gte: startDate, lte: endDate },
    };

    try {
      const openStatus = [...QMS_STATUS_OPEN_SET];

      // 1. KPI & Basic Aggregations
      const [kpiAggregate, openCount, resolvedStats] = await Promise.all([
        prisma.after_sales.aggregate({
          where: baseWhere,
          _count: { id: true },
          _sum: { materialCost: true, laborTravelCost: true },
        }),
        prisma.after_sales.count({
          where: { ...baseWhere, claimStatus: { in: openStatus as any } },
        }),
        // Average Resolution Time using Raw Query
        prisma.$queryRaw<Array<{ avgDays: number }>>`
          SELECT AVG(DATEDIFF(closeDate, occurDate)) as avgDays 
          FROM after_sales 
          WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate} 
          AND closeDate IS NOT NULL
        `,
      ]);

      const total = kpiAggregate._count.id || 0;
      const totalCost =
        (Number(kpiAggregate._sum.materialCost) || 0) +
        (Number(kpiAggregate._sum.laborTravelCost) || 0);
      const avgTime = Number(resolvedStats?.[0]?.avgDays) || 0;

      // 2. Distributions (Defect, Supplier, Dept)
      const [defectStats, supplierStats, deptStats] = await Promise.all([
        prisma.after_sales.groupBy({
          by: ['defectType'],
          where: baseWhere,
          _count: { id: true },
        }),
        prisma.after_sales.groupBy({
          by: ['supplierBrand'],
          where: baseWhere,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 5,
        }),
        prisma.after_sales.groupBy({
          by: ['respDept'],
          where: baseWhere,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
      ]);

      // 3. Trend Analysis (Monthly) - Use Raw Query for efficiency
      const trendResults = isYearMode
        ? await prisma.$queryRaw<
            Array<{
              closed: bigint;
              costs: number;
              issues: bigint;
              period: number;
            }>
          >`
            SELECT 
              MONTH(occurDate) as period,
              COUNT(*) as issues,
              SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as costs,
              SUM(
                CASE
                  WHEN closeDate IS NOT NULL AND closeDate >= ${startDate} AND closeDate <= ${endDate}
                  THEN 1 ELSE 0
                END
              ) as closed
            FROM after_sales
            WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate}
            GROUP BY period
          `
        : await prisma.$queryRaw<
            Array<{
              closed: bigint;
              costs: number;
              issues: bigint;
              period: Date;
            }>
          >`
            SELECT 
              DATE(occurDate) as period,
              COUNT(*) as issues,
              SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as costs,
              SUM(
                CASE
                  WHEN closeDate IS NOT NULL AND DATE(closeDate) = DATE(occurDate)
                  THEN 1 ELSE 0
                END
              ) as closed
            FROM after_sales
            WHERE isDeleted = 0 AND occurDate >= ${startDate} AND occurDate <= ${endDate}
            GROUP BY period
          `;

      // 4. Format Result
      const monthlyIssues: number[] = Array.from(
        { length: months.length },
        () => 0,
      );
      const monthlyClosed: number[] = Array.from(
        { length: months.length },
        () => 0,
      );
      const monthlyCosts: number[] = Array.from(
        { length: months.length },
        () => 0,
      );

      if (isYearMode) {
        trendResults.forEach((r) => {
          const mIdx = Number(r.period) - startDate.getMonth() - 1;
          if (mIdx >= 0 && mIdx < months.length) {
            monthlyIssues[mIdx] = Number(r.issues);
            monthlyClosed[mIdx] = Number(r.closed);
            monthlyCosts[mIdx] = Number(r.costs.toFixed(2));
          }
        });
      } else {
        const periodMap = new Map<
          string,
          { closed: bigint; costs: number; issues: bigint; period: Date }
        >(
          trendResults.map(
            (item) => [formatDate(item.period).slice(0, 10), item] as const,
          ),
        );
        months.forEach((_, index) => {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + index);
          const key = formatDate(date).slice(0, 10);
          const item = periodMap.get(key);
          if (!item) return;
          monthlyIssues[index] = Number(item.issues);
          monthlyClosed[index] = Number(item.closed);
          monthlyCosts[index] = Number(item.costs.toFixed(2));
        });
      }

      return {
        kpi: {
          total,
          open: openCount,
          cost: Number(totalCost.toFixed(2)),
          avgTime: Number(avgTime.toFixed(1)),
        },
        trend: {
          category: months,
          issues: monthlyIssues,
          closed: monthlyClosed,
          costs: monthlyCosts,
        },
        defectDistribution: defectStats.map((s) => ({
          name: s.defectType || QMS_DEFAULT_VALUES.UNCLASSIFIED,
          value: s._count.id,
        })),
        supplierRanking: {
          categories: supplierStats.map((s) => s.supplierBrand || 'Unknown'),
          data: supplierStats.map((s) => s._count.id),
        },
        deptDistribution: deptStats.map((s) => ({
          name: s.respDept || QMS_DEFAULT_VALUES.UNASSIGNED,
          value: s._count.id,
        })),
      };
    } catch (error) {
      logger.error({ err: error, params }, 'getStats failed');
      const emptyMonthly = (): number[] =>
        Array.from({ length: months.length }, () => 0);
      return {
        kpi: { total: 0, open: 0, cost: 0, avgTime: 0 },
        trend: {
          category: months,
          issues: emptyMonthly(),
          closed: emptyMonthly(),
          costs: emptyMonthly(),
        },
        defectDistribution: [],
        supplierRanking: { categories: [], data: [] },
        deptDistribution: [],
      };
    }
  },

  /**
   * Get List of After-Sales Records with filtering
   */
  async getList(
    params: AfterSalesParams & {
      dateMode?: AfterSalesDateMode;
      dateValue?: string;
      userContext?: { userId: string; username?: string };
    },
  ): Promise<AfterSalesItem[]> {
    const {
      dateMode,
      dateValue,
      projectName,
      status,
      supplierBrand,
      workOrderNumber,
      year,
    } = params;

    let where: Prisma.after_salesWhereInput = {
      isDeleted: false,
    };

    // Date Logic
    const hasCustomRange = dateMode === 'month' || dateMode === 'week';
    if (year || hasCustomRange) {
      const { start, end } = buildAfterSalesDateRange({
        dateMode,
        dateValue,
        year,
      });
      where.occurDate = {
        gte: start,
        lt: end,
      };
    }

    if (workOrderNumber && String(workOrderNumber).trim() !== '') {
      where.workOrderNumber = {
        contains: String(workOrderNumber).trim(),
      };
    }
    if (projectName && String(projectName).trim() !== '') {
      where.projectName = { contains: String(projectName).trim() };
    }
    if (status && String(status).trim() !== '') {
      where.claimStatus = String(status).trim() as any;
    }
    if (supplierBrand && String(supplierBrand).trim() !== '') {
      where.OR = [
        { supplierBrand: { contains: String(supplierBrand).trim() } },
        { projectName: { contains: String(supplierBrand).trim() } },
      ];
    }

    if (params.userContext?.userId) {
      where = await DataScopeService.buildAfterSalesWhere(where, {
        userId: params.userContext.userId,
        username: params.userContext.username,
      });
    }

    const list = await prisma.after_sales.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Map to frontend expectation with formatted dates
    return list.map((item) => {
      const materialCost = Number(item.materialCost) || 0;
      const laborTravelCost = Number(item.laborTravelCost) || 0;

      return {
        ...item,
        issueDate: formatDate(item.occurDate),
        occurDate: formatDate(item.occurDate),
        factoryDate: formatDate(item.factoryDate),
        closeDate: formatDate(item.closeDate),
        shipDate: formatDate(item.shipDate),
        createdAt: formatDate(item.createdAt),
        responsibleDept: item.respDept || '',
        resolutionPlan: item.solution || '',
        status: item.claimStatus,
        isClaim: item.isClaim || false,
        materialCost,
        laborTravelCost,
        qualityLoss: materialCost + laborTravelCost,
        photos: tryParsePhotos(item.photos as string),
        productType: item.productType || '',
        productSubtype: item.productSubtype || '',
        division: item.division || '',
        partName: item.partName || '',
        supplierBrand: item.supplierBrand || '',
        runningHours: Number(item.runningHours) || 0,
      } as AfterSalesItem;
    });
  },

  /**
   * Soft delete a record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    await prisma.after_sales.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    // Record audit log
    await SystemLogService.recordAuditLog({
      userId,
      action: 'DELETE',
      targetType: 'after_sales',
      targetId: id,
      details: 'Soft deleted after-sales record',
    });
  },
};
