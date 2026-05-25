import type { DashboardChartItem, DashboardOverview } from '@qgs/shared';

import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { QualityLossService } from '~/modules/quality-loss/quality-loss.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import { createModuleLogger } from '~/utils/logger';
import { getNetPassRateSummaryByRange } from '~/utils/pass-rate';
import {
  buildCanonicalProcessPassRateTargets,
  PROCESS_PASS_RATE_TARGET_ORDER,
} from '~/utils/pass-rate-process';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

// 创建模块级 logger
const logger = createModuleLogger('DashboardService');

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
  async getPassRateTargets() {
    const setting = await prisma.system_settings.findUnique({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
    });
    const savedTargets = setting?.value ? JSON.parse(setting.value) : {};
    const canonicalTargets = buildCanonicalProcessPassRateTargets(savedTargets);
    return Object.fromEntries(
      PROCESS_PASS_RATE_TARGET_ORDER.map((key) => [key, canonicalTargets[key]]),
    );
  },

  async savePassRateTargets(targets: Record<string, number>) {
    const value = JSON.stringify(targets);
    await prisma.system_settings.upsert({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
      update: { value, updatedAt: new Date() },
      create: {
        key: 'QMS_PASS_RATE_TARGETS',
        value,
        description: 'QMS各工序目标合格率配置 (Quality Pass Rate Targets)',
      },
    });
  },

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
        const [afterSales, inspection, commissioning, workOrder, qualityLoss] =
          await Promise.all([
            AfterSalesService.getStatsForDashboard({ weekStart, yearStart }),
            InspectionService.getStatsForDashboard({ weekStart, yearStart }),
            VehicleCommissioningService.getStatsForDashboard({
              weekStart,
              yearStart,
            }),
            WorkOrderService.getStatsForDashboard({ weekStart, yearStart }),
            QualityLossService.getStatsForDashboard({ weekStart, yearStart }),
          ]);

        return {
          overview: {
            fieldIssues: {
              open: afterSales.weeklyCount,
              total: afterSales.totalCount,
            },
            processIssues: {
              open: inspection.weeklyCount + commissioning.weeklyCount,
              total: inspection.totalCount + commissioning.totalCount,
            },
            qualityLoss: {
              weekly:
                afterSales.weeklyLoss +
                inspection.weeklyLoss +
                commissioning.weeklyLoss +
                qualityLoss.weeklyLoss,
              total:
                afterSales.totalLoss +
                inspection.totalLoss +
                commissioning.totalLoss +
                qualityLoss.totalLoss,
            },
            workOrders: {
              weekly: workOrder.weeklyCount,
              total: workOrder.totalCount,
            },
            openIssues:
              afterSales.weeklyCount +
              inspection.weeklyCount +
              commissioning.weeklyCount,
            passRate: 0,
            totalInspections: 0,
          },
          recentWorkOrders: workOrder.recentWorkOrders || [],
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
        return Promise.all(
          months.map(async (m, idx) => {
            const start = new Date(currentYear, idx, 1);
            const end = new Date(currentYear, idx + 1, 0, 23, 59, 59, 999);
            const summary = await getNetPassRateSummaryByRange(start, end);

            let passRate: null | number = 100;
            if (summary.totalCount > 0) {
              passRate = summary.passRate;
            } else if (idx > currentMonthIndex) {
              passRate = null;
            }

            return {
              month: m,
              value: passRate === null ? 0 : passRate,
              rate: passRate ?? 0,
            };
          }),
        );
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
      const stats = await InspectionService.getStatsForDashboard({
        weekStart: getStartOfWeek(),
        yearStart: getStartOfYear(),
      });
      return stats.issueDistribution;
    } catch (error) {
      logger.error({ err: error }, 'getIssueDistribution 执行失败');
      return [];
    }
  },
};
