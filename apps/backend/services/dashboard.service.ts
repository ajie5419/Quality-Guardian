import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

// 创建模块级 logger
const logger = createModuleLogger('DashboardService');

// 抽离常量：集中管理可配置项
const DASHBOARD_CONSTANTS = {
  RECENT_WO_LIMIT: 5,
};

/**
 * 获取当前年份的起始时间 (YYYY-01-01 00:00:00)
 */
const getStartOfYear = (date: Date = new Date()) => {
  const start = new Date(date.getFullYear(), 0, 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

/**
 * 获取本周起始时间 (周一)
 */
const getStartOfWeek = (date: Date = new Date()) => {
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
  async getStats() {
    try {
      const yearStart = getStartOfYear();
      const weekStart = getStartOfWeek();
      const baseWhere = { isDeleted: false };

      // 1. 并行执行所有聚合查询
      const [
        // 年度累计数据
        yearAfterSales,
        yearQualityRecords,
        yearWorkOrders,
        yearQualityLosses,
        // 本周新增数据
        weekAfterSalesCount,
        weekQualityRecordsCount,
        weekWorkOrdersCount,
        weekLossesAggregate,
        // 最近工单
        recentWorkOrders,
      ] = await Promise.all([
        // --- 年度数据 ---
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

        // --- 本周数据 (仅需计数或部分聚合) ---
        prisma.after_sales.count({
          where: { ...baseWhere, occurDate: { gte: weekStart } },
        }),
        prisma.quality_records.count({
          where: { ...baseWhere, date: { gte: weekStart } },
        }),
        prisma.work_orders.count({
          where: { ...baseWhere, createdAt: { gte: weekStart } },
        }),
        // 本周损失合计 (并行查询三个表的本周金额)
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

        // --- 最近工单 ---
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

      // 2. 数据计算与兜底
      // 年度总损失
      const totalLoss =
        (Number(yearAfterSales._sum.materialCost) || 0) +
        (Number(yearAfterSales._sum.laborTravelCost) || 0) +
        (Number(yearQualityRecords._sum.lossAmount) || 0) +
        (Number(yearQualityLosses._sum.amount) || 0);

      // 本周总损失
      const [weekAfterSalesSum, weekRecordsSum, weekManualSum] =
        weekLossesAggregate;
      const weeklyLossTotal =
        (Number(weekAfterSalesSum._sum.materialCost) || 0) +
        (Number(weekAfterSalesSum._sum.laborTravelCost) || 0) +
        (Number(weekRecordsSum._sum.lossAmount) || 0) +
        (Number(weekManualSum._sum.amount) || 0);

      // 3. 组装返回结构
      return {
        overview: {
          fieldIssues: {
            open: weekAfterSalesCount || 0, // 语义映射：open -> 本周新增
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
        },
        recentWorkOrders: recentWorkOrders || [],
      };
    } catch (error) {
      logger.error({ err: error }, 'getStats 执行失败');
      // 兜底返回空数据
      return {
        overview: {
          fieldIssues: { open: 0, total: 0 },
          processIssues: { open: 0, total: 0 },
          qualityLoss: { weekly: 0, total: 0 },
          workOrders: { weekly: 0, total: 0 },
        },
        recentWorkOrders: [],
      };
    }
  },

  /**
   * 获取月度质量趋势 (合格率 & 缺陷数)
   */
  async getMonthlyTrend() {
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
      // 使用 raw query 聚合按月统计，性能更佳
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

        const total = Number(insp?.totalQty || 0);
        const qualified = Number(insp?.qualifiedQty || 0);
        const defect = Number(def?.defectQty || 0);

        let passRate: null | number = 100; // Default to 100 if no data
        if (total > 0 || defect > 0) {
          // If we have NCRs but no inspections, the pass rate should be 0 or calculated against defects
          const effectiveTotal = Math.max(total, defect);
          const netQualified = Math.max(0, qualified - defect);
          passRate = Number(((netQualified / effectiveTotal) * 100).toFixed(1));
        } else if (idx > currentMonthIndex) {
          // Future months
          passRate = null;
        } else {
          // Current or past months with NO activity - show target or 100
          passRate = 100;
        }

        return {
          period: m,
          passRate,
        };
      });
    } catch (error) {
      logger.error({ err: error }, 'getMonthlyTrend 执行失败');
      return [];
    }
  },

  /**
   * 获取缺陷类型分布
   */
  async getIssueDistribution() {
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
