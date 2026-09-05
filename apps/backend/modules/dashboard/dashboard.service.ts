import type { DashboardChartItem, DashboardStats } from '@qgs/shared';
import type { AnalyticsAccessContext } from '~/modules/data-scope';

import process from 'node:process';

import { AfterSalesAPI } from '~/modules/after-sales';
import { requireAnalyticsUser } from '~/modules/data-scope';
import { InspectionService } from '~/modules/inspection';
import { getFirstPassYieldDashboardTrend } from '~/modules/metric-governance';
import { QualityLossService } from '~/modules/quality-loss';
import { getPassRateMonthlyTrend } from '~/modules/report/pass-rate';
import {
  buildCanonicalProcessPassRateTargets,
  PROCESS_PASS_RATE_TARGET_ORDER,
  roundPercent,
} from '~/modules/report/pass-rate-process';
import { SystemService } from '~/modules/system';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning';
import { WorkOrderService } from '~/modules/work-order';
import { createModuleLogger } from '~/utils/logger';

// 创建模块级 logger
const logger = createModuleLogger('DashboardService');
const DASHBOARD_STATS_CACHE_TTL_MS = 60_000;
const DASHBOARD_TREND_CACHE_TTL_MS = 3_600_000;

type DashboardStatsResult = DashboardStats;

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

function buildDashboardStatsCacheKey(userId: string) {
  return `qms:dashboard:stats:${userId || 'anonymous'}`;
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
  invalidateStatsCache() {
    dashboardStatsCache.clear();
    dashboardTrendCache.clear();
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
    access: AnalyticsAccessContext,
  ): Promise<DashboardStatsResult> {
    const user = requireAnalyticsUser(access);
    // Scope derives from the user's roles/department, so keying the shared
    // in-memory cache by userId keeps DEPT/SELF/ALL aggregates isolated.
    const cacheKey = buildDashboardStatsCacheKey(user.userId);
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
            AfterSalesAPI.getStatsForDashboard(
              { weekStart, yearStart },
              access,
            ),
            InspectionService.getStatsForDashboard(
              { weekStart, yearStart },
              access,
            ),
            // vehicle-commissioning has no DataScope declaration (not one of
            // the six protected modules); tracked as LEGACY in
            // docs/permission-module.md until a dedicated scope is defined.
            VehicleCommissioningService.getStatsForDashboard({
              weekStart,
              yearStart,
            }),
            WorkOrderService.getStatsForDashboard(
              { weekStart, yearStart },
              access,
            ),
            QualityLossService.getStatsForDashboard(
              { weekStart, yearStart },
              access,
            ),
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
  async getMonthlyTrend(
    access: AnalyticsAccessContext,
  ): Promise<DashboardChartItem[]> {
    const user = requireAnalyticsUser(access);
    const cacheKey = `qms:dashboard:trend:${user.userId}`;
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
        const start = new Date(currentYear, 0, 1);
        const end = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        const useCanonical =
          process.env.METRIC_FIRST_PASS_DASHBOARD_CANONICAL !== 'false';
        const canonicalPoints = useCanonical
          ? await getFirstPassYieldDashboardTrend({
              start,
              end,
              access,
              useCanonical,
            })
          : null;
        const points =
          canonicalPoints && canonicalPoints.length > 0
            ? canonicalPoints
            : await getPassRateMonthlyTrend(start, end, access);
        const summaryByMonth = new Map<
          number,
          { passCount: number; totalCount: number }
        >();
        for (const point of points) {
          const current = summaryByMonth.get(point.month) || {
            passCount: 0,
            totalCount: 0,
          };
          current.passCount += point.passCount;
          current.totalCount += point.totalCount;
          summaryByMonth.set(point.month, current);
        }

        return months.map((m, idx) => {
          const summary = summaryByMonth.get(idx);
          let passRate: null | number = 100;
          if (summary && summary.totalCount > 0) {
            passRate = roundPercent(
              (summary.passCount / summary.totalCount) * 100,
            );
          } else if (idx > currentMonthIndex) {
            passRate = null;
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

    setCachedDashboardTrend(cacheKey, result);
    return result;
  },

  /**
   * 获取缺陷类型分布
   */
  async getIssueDistribution(
    access: AnalyticsAccessContext,
  ): Promise<DashboardChartItem[]> {
    try {
      requireAnalyticsUser(access);
      const stats = await InspectionService.getStatsForDashboard(
        {
          weekStart: getStartOfWeek(),
          yearStart: getStartOfYear(),
        },
        access,
      );
      return stats.issueDistribution;
    } catch (error) {
      logger.error({ err: error }, 'getIssueDistribution 执行失败');
      return [];
    }
  },
};
