import type { DashboardChartItem, DashboardOverview } from '@qgs/shared';

import { safeNumber } from '@qgs/shared';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

// 创建模块级 logger
const logger = createModuleLogger('DashboardService');

// 抽离常量：集中管理可配置项
const DASHBOARD_CONSTANTS = {
  RECENT_WO_LIMIT: 5,
};

/**
 * 获取当前年份的起始时间 (YYYY-01-01 00:00:00)
 */
const getStartOfYear = (date: Date = new Date()): Date => {
  const start = new Date(date.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * 获取本周起始时间 (周一)
 */
const getStartOfWeek = (date: Date = new Date()): Date => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - (day === 0 ? 6 : day - 1); // Adjust when day is sunday
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const DashboardService = {
  /**
   * 获取仪表盘核心统计数据 (包含年度总计和本周新增)
   */
  async getStats(): Promise<{
    overview: DashboardOverview;
    recentWorkOrders: any[];
  }> {
    const cacheKey = 'qms:dashboard:stats';
    const cached = await redis.get<{
      overview: DashboardOverview;
      recentWorkOrders: any[];
    }>(cacheKey);
    if (cached) {
      console.warn(`[Dashboard Cache] HIT - Key: ${cacheKey}`);
      return cached;
    }

    const result = await (async () => {
      try {
        const yearStart = getStartOfYear();
        const weekStart = getStartOfWeek();
        const baseWhere = { isDeleted: false };

        const [
          yearAfterSales,
          yearQualityRecords,
          yearWorkOrders,
          yearQualityLosses,
          weekAfterSalesCount,
          weekQualityRecordsCount,
          weekWorkOrdersCount,
          weekLossesAggregate,
          recentWorkOrders,
        ] = await Promise.all([
          prisma.after_sales.aggregate({
            where: { ...baseWhere, occurDate: { gte: yearStart } },
            _count: { id: true },
            _sum: { materialCost: true, laborTravelCost: true },
          }),
          prisma.quality_records.aggregate({
            where: { ...baseWhere, date: { gte: yearStart } },
            _count: { id: true },
            _sum: { lossAmount: true },
          }),
          prisma.work_orders.aggregate({
            where: { ...baseWhere, createdAt: { gte: yearStart } },
            _count: { workOrderNumber: true },
          }),
          prisma.quality_losses.aggregate({
            where: { ...baseWhere, occurDate: { gte: yearStart } },
            _sum: { amount: true },
          }),
          prisma.after_sales.count({
            where: { ...baseWhere, occurDate: { gte: weekStart } },
          }),
          prisma.quality_records.count({
            where: { ...baseWhere, date: { gte: weekStart } },
          }),
          prisma.work_orders.count({
            where: { ...baseWhere, createdAt: { gte: weekStart } },
          }),
          Promise.all([
            prisma.after_sales.aggregate({
              where: { ...baseWhere, occurDate: { gte: weekStart } },
              _sum: { materialCost: true, laborTravelCost: true },
            }),
            prisma.quality_records.aggregate({
              where: { ...baseWhere, date: { gte: weekStart } },
              _sum: { lossAmount: true },
            }),
            prisma.quality_losses.aggregate({
              where: { ...baseWhere, occurDate: { gte: weekStart } },
              _sum: { amount: true },
            }),
          ]),
          prisma.work_orders.findMany({
            where: baseWhere,
            take: DASHBOARD_CONSTANTS.RECENT_WO_LIMIT,
            orderBy: { createdAt: 'desc' },
            select: {
              workOrderNumber: true,
              projectName: true,
              status: true,
              customerName: true,
            },
          }),
        ]);

        const totalLoss =
          safeNumber(yearAfterSales._sum.materialCost) +
          safeNumber(yearAfterSales._sum.laborTravelCost) +
          safeNumber(yearQualityRecords._sum.lossAmount) +
          safeNumber(yearQualityLosses._sum.amount);

        const [weekAfterSalesSum, weekRecordsSum, weekManualSum] =
          weekLossesAggregate;
        const weeklyLossTotal =
          safeNumber(weekAfterSalesSum._sum.materialCost) +
          safeNumber(weekAfterSalesSum._sum.laborTravelCost) +
          safeNumber(weekRecordsSum._sum.lossAmount) +
          safeNumber(weekManualSum._sum.amount);

        return {
          overview: {
            fieldIssues: {
              open: weekAfterSalesCount || 0,
              total: yearAfterSales._count.id || 0,
            },
            processIssues: {
              open: weekQualityRecordsCount || 0,
              total: yearQualityRecords._count.id || 0,
            },
            qualityLoss: {
              weekly: weeklyLossTotal,
              total: totalLoss,
            },
            workOrders: {
              weekly: weekWorkOrdersCount || 0,
              total: yearWorkOrders._count.workOrderNumber || 0,
            },
            openIssues: weekAfterSalesCount + weekQualityRecordsCount,
            passRate: 0,
            totalInspections: 0,
          },
          recentWorkOrders: recentWorkOrders || [],
        };
      } catch (error) {
        logger.error({ err: error }, 'getStats 执行失败');
        return {
          overview: {
            fieldIssues: { open: 0, total: 0 },
            processIssues: { open: 0, total: 0 },
            qualityLoss: { weekly: 0, total: 0 },
            workOrders: { weekly: 0, total: 0 },
            openIssues: 0,
            passRate: 0,
            totalInspections: 0,
          },
          recentWorkOrders: [],
        };
      }
    })();

    console.warn(`[Dashboard Cache] MISS - Key: ${cacheKey}`);
    await redis.set(cacheKey, result, 60 * 5); // 5 minutes
    return result;
  },

  /**
   * 获取月度质量趋势 (合格率 & 缺陷数)
   */
  async getMonthlyTrend(): Promise<DashboardChartItem[]> {
    const cacheKey = 'qms:dashboard:trend';
    const cached = await redis.get<DashboardChartItem[]>(cacheKey);
    if (cached) {
      console.warn(`[Dashboard Cache] HIT - Key: ${cacheKey}`);
      return cached;
    }

    const result = await (async () => {
      const currentYear = new Date().getFullYear();
      try {
        interface MonthInspecResult {
          month: bigint | number;
          totalQty: bigint | number;
          qualifiedQty: bigint | number;
        }
        interface MonthDefectResult {
          month: bigint | number;
          defectQty: bigint | number;
        }
        const [inspections, defects] = (await Promise.all([
          prisma.$queryRaw`
            SELECT 
              MONTH(inspectionDate) as month, 
              SUM(quantity) as totalQty,
              SUM(CASE WHEN result = 'PASS' THEN quantity ELSE 0 END) as qualifiedQty
            FROM inspections 
            WHERE YEAR(inspectionDate) = ${currentYear} AND isDeleted = ${false}
            GROUP BY MONTH(inspectionDate)
          `,
          prisma.$queryRaw`
            SELECT 
              MONTH(date) as month, 
              SUM(quantity) as defectQty
            FROM quality_records
            WHERE YEAR(date) = ${currentYear} AND isDeleted = ${false}
            GROUP BY MONTH(date)
          `,
        ])) as [MonthInspecResult[], MonthDefectResult[]];

        const months = [
          '1月',
          '2月',
          '3月',
          '4月',
          '5月',
          '6月',
          '7月',
          '8月',
          '9月',
          '10月',
          '11月',
          '12月',
        ];
        const currentMonthIndex = new Date().getMonth();

        return months.map((m, idx) => {
          const mIdx = idx + 1;
          const insp = inspections.find((r) => Number(r.month) === mIdx);
          const def = defects.find((r) => Number(r.month) === mIdx);

          const total = safeNumber(insp?.totalQty);
          const qualified = safeNumber(insp?.qualifiedQty);
          const defect = safeNumber(def?.defectQty);

          let passRate: null | number = 100;
          if (total > 0 || defect > 0) {
            const effectiveTotal = Math.max(total, defect);
            const netQualified = Math.max(0, qualified - defect);
            passRate = Number(
              ((netQualified / effectiveTotal) * 100).toFixed(1),
            );
          } else if (idx > currentMonthIndex) {
            passRate = null;
          } else {
            passRate = 100;
          }

          return {
            month: m,
            value: passRate === null ? 0 : passRate,
            rate: passRate ?? 0,
          };
        });
      } catch (error) {
        logger.error({ err: error }, 'getMonthlyTrend 执行失败');
        return [];
      }
    })();

    console.warn(`[Dashboard Cache] MISS - Key: ${cacheKey}`);
    await redis.set(cacheKey, result, 3600); // 1 hour cache
    return result;
  },

  /**
   * 获取缺陷类型分布
   */
  async getIssueDistribution(): Promise<DashboardChartItem[]> {
    try {
      const currentYearStart = getStartOfYear();

      const stats = await prisma.quality_records.groupBy({
        by: ['defectType'],
        where: {
          isDeleted: false,
          date: { gte: currentYearStart },
        },
        _count: true,
      });

      return stats.map((s) => ({
        type: s.defectType || 'Unknown',
        value: s._count,
      }));
    } catch (error) {
      logger.error({ err: error }, 'getIssueDistribution 执行失败');
      return [];
    }
  },
};
