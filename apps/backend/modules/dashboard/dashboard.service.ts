import type { DashboardChartItem, DashboardOverview } from '@qgs/shared';

import { AfterSalesService } from '~/modules/after-sales';
import { InspectionService } from '~/modules/inspection';
import { QualityLossService } from '~/modules/quality-loss';
import { SystemService } from '~/modules/system';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning';
import { WorkOrderService } from '~/modules/work-order';
import { createModuleLogger } from '~/utils/logger';
import { getNetPassRateSummaryByRange } from '~/utils/pass-rate';
import {
  buildCanonicalProcessPassRateTargets,
  PROCESS_PASS_RATE_TARGET_ORDER,
} from '~/utils/pass-rate-process';

// 创建模块级 logger
const logger = createModuleLogger('DashboardService');
const DASHBOARD_STATS_CACHE_TTL_MS = 60_000;
const DASHBOARD_TREND_CACHE_TTL_MS = 3_600_000;

type DashboardStatsResult = {
  overview: DashboardOverview;
  recentWorkOrders: any[];
};

type DashboardStatsParams = {
  granularity?: string;
  scope?: string;
  userId?: string;
};

const dashboardStatsCache = new Map<
  string,
  { expiresAt: number; value: DashboardStatsResult }
>();
const dashboardTrendCache = new Map<
  string,
  { expiresAt: number; value: DashboardChartItem[] }
>();

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

function buildDashboardStatsCacheKey(params: DashboardStatsParams = {}) {
  return [
    'qms:dashboard:stats',
    params.userId || 'anonymous',
    params.scope || 'default',
    params.granularity || 'default',
  ].join(':');
}

function getCachedDashboardStats(cacheKey: string) {
  const cached = dashboardStatsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    dashboardStatsCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedDashboardStats(
  cacheKey: string,
  value: DashboardStatsResult,
) {
  dashboardStatsCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_STATS_CACHE_TTL_MS,
    value,
  });
}

function getCachedDashboardTrend(cacheKey: string) {
  const cached = dashboardTrendCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    dashboardTrendCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedDashboardTrend(
  cacheKey: string,
  value: DashboardChartItem[],
) {
  dashboardTrendCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_TREND_CACHE_TTL_MS,
    value,
  });
}

export const DashboardService = {
  invalidateStatsCache(params?: DashboardStatsParams) {
    if (!params) {
      dashboardStatsCache.clear();
      dashboardTrendCache.clear();
      return;
    }
    dashboardStatsCache.delete(buildDashboardStatsCacheKey(params));
  },

  async getPassRateTargets() {
    const value = await SystemService.getSettingValue('QMS_PASS_RATE_TARGETS');
    const savedTargets = value ? JSON.parse(value) : {};
    const canonicalTargets = buildCanonicalProcessPassRateTargets(savedTargets);
    return Object.fromEntries(
      PROCESS_PASS_RATE_TARGET_ORDER.map((key) => [key, canonicalTargets[key]]),
    );
  },

  async savePassRateTargets(targets: Record<string, number>) {
    const value = JSON.stringify(targets);
    await SystemService.saveSettingValue({
      key: 'QMS_PASS_RATE_TARGETS',
      value,
      description: 'QMS各工序目标合格率配置 (Quality Pass Rate Targets)',
    });
  },

  /**
   * 获取仪表盘核心统计数据 (包含年度总计和本周新增)
   */
  async getStats(
    params: DashboardStatsParams = {},
  ): Promise<DashboardStatsResult> {
    const cacheKey = buildDashboardStatsCacheKey(params);
    const cached = getCachedDashboardStats(cacheKey);
    if (cached) {
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

    setCachedDashboardStats(cacheKey, result);
    return result;
  },

  /**
   * 获取月度质量趋势 (合格率 & 缺陷数)
   */
  async getMonthlyTrend(): Promise<DashboardChartItem[]> {
    const cacheKey = 'qms:dashboard:trend';
    const cached = getCachedDashboardTrend(cacheKey);
    if (cached) {
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

    setCachedDashboardTrend(cacheKey, result);
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
