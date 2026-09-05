import type {
  PageResult,
  QualityLossCharts,
  QualityLossDashboardSummary,
  QualityLossItem,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
import type { AnalyticsAccessContext } from '~/modules/data-scope';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { QualityLossQueryParams, TrendRow } from './quality-loss-format';

import { Prisma } from '@prisma/client';
import { createIdentityAggregateItem } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { EXPORT_QUERY_TAKE } from '~/utils/export-constants';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { parsePagination } from '~/utils/query-helpers';

import {
  buildIndexWhere,
  formatIndexRow,
  formatTrendItem,
  mergeTrendData,
  QL_CONSTANTS,
} from './quality-loss-format';
import { QualityLossRecordMaintenanceService } from './quality-loss-record-maintenance.service';
import { QualityLossReportingService } from './quality-loss-reporting.service';
import { QualityLossRouteUpdateService } from './quality-loss-route-update.service';
import {
  buildQualityLossDeptDistribution,
  buildQualityLossYearlyTrend,
  buildShanghaiYearWindow,
} from './quality-loss-yearly-charts';

const logger = createModuleLogger('QualityLossService');

async function applyDeptNames(items: QualityLossItem[]) {
  const names = await MasterDataGovernanceKernel.resolveCanonicalNamesByIds({
    canonicalIds: items.map((item) => item.responsibleDepartmentId),
    configKey: 'responsibleDepartment',
    idLikeNameById: items
      .map((item) => ({
        id: item.responsibleDepartmentId || '',
        rawName: item.responsibleDepartment ?? null,
      }))
      .filter((pair) => pair.id !== ''),
  });
  return items.map((item) => {
    const identity = createIdentityAggregateItem({
      canonicalName: item.responsibleDepartmentId
        ? names.get(item.responsibleDepartmentId)
        : null,
      id: item.responsibleDepartmentId,
      rawName: item.responsibleDepartment,
      value: 0,
    });
    return {
      ...item,
      responsibleDepartmentCanonicalName: identity.name,
      responsibleDepartmentResolutionReason: identity.resolutionReason,
      responsibleDepartmentResolutionStatus: identity.resolutionStatus,
    };
  });
}

async function buildScopedIndexWhere(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
): Promise<Prisma.quality_loss_indexWhereInput> {
  const baseWhere = buildIndexWhere(params);
  if (!params.userContext?.userId) return baseWhere;
  return DataScopeService.buildQualityLossIndexWhere(
    baseWhere,
    params.userContext,
    params.dataScope,
  );
}

async function buildQualityLossIndexRawScopeSql(
  userContext: { userId: string; username?: string },
  dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>,
) {
  if (!dataScope || dataScope.scopeType === 'ALL') return Prisma.empty;
  if (dataScope.scopeType === 'SELF') {
    const deptIds = dataScope.deptIds ?? [];
    if (deptIds.length > 0) {
      return Prisma.sql`AND respDeptId IN (${Prisma.join(deptIds)})`;
    }
    return Prisma.sql`AND createdBy = ${userContext.userId}`;
  }
  const deptIds = dataScope.deptIds ?? [];
  if (deptIds.length === 0) return Prisma.sql`AND 1 = 0`;
  return Prisma.sql`AND respDeptId IN (${Prisma.join(deptIds)})`;
}

// Raw statuses that normalize to the unified "Confirmed" bucket. The pending
// KPI excludes only Confirmed rows (Pending/Processing/Resolved all count),
// mirroring QualityLossSummaryService.getDashboardSummary.
const CONFIRMED_INDEX_STATUSES = ['CLOSED', 'COMPLETED', 'CONFIRMED'];

export const QualityLossService = {
  async getStatsForDashboard(
    params: { weekStart: Date; yearStart: Date },
    access?: AnalyticsAccessContext,
  ) {
    return QualityLossReportingService.getStatsForDashboard(params, access);
  },

  async getWeeklyTrackingIssues(
    params: {
      closedStatuses: string[];
      end: Date;
      start: Date;
      take?: number;
    },
    access?: AnalyticsAccessContext,
  ) {
    return QualityLossReportingService.getWeeklyTrackingIssues(params, access);
  },

  async getReportPeriodMetrics(
    params: { end: Date; start: Date },
    access?: AnalyticsAccessContext,
  ) {
    return QualityLossReportingService.getReportPeriodMetrics(params, access);
  },

  async updateByRouteId(params: {
    body: Record<string, unknown>;
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
    id: string;
    userId: string;
    username?: string;
  }) {
    return QualityLossRouteUpdateService.updateByRouteId(params);
  },

  /**
   * 获取趋势数据（按月或按周）
   */
  async getTrendData(
    granularity: 'month' | 'week',
    userContext?: { userId: string; username?: string },
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>,
  ): Promise<{ trend: QualityLossServiceTrendItem[] }> {
    const year = new Date().getFullYear();
    const isWeek = granularity === 'week';
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const nextYearStart = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    try {
      // 统一出口：直接查询 quality_loss_index 物化表（四源口径在写入时统一：
      // Internal amount>0 / External isClaim||amount>0 / Commissioning isClaim||amount>0 / Manual amount>0）。
      // 不再调用各源模块的直查函数（已退役，见 metrics-registry M-B03）。
      const scopeSql = userContext?.userId
        ? await buildQualityLossIndexRawScopeSql(userContext, dataScope)
        : Prisma.empty;
      const rows = await prisma.$queryRaw<
        Array<{
          a: bigint | null | number | Prisma.Decimal;
          p: bigint | number;
          source: string;
        }>
      >`SELECT ${isWeek ? Prisma.sql`WEEK(occurDate, 3)` : Prisma.sql`MONTH(occurDate)`} as p, source, SUM(amount) as a
        FROM quality_loss_index
        WHERE occurDate >= ${yearStart} AND occurDate < ${nextYearStart} AND isDeleted = 0 ${scopeSql}
        GROUP BY p, source`;

      const manual: TrendRow[] = [];
      const internal: TrendRow[] = [];
      const external: TrendRow[] = [];
      const commissioning: TrendRow[] = [];
      for (const row of rows) {
        const item: TrendRow = { p: Number(row.p), a: Number(row.a) || 0 };
        switch (row.source) {
          case 'External': {
            external.push(item);
            break;
          }
          case 'Internal': {
            internal.push(item);
            break;
          }
          case 'Manual': {
            manual.push(item);
            break;
          }
          default: {
            commissioning.push(item);
          }
        }
      }

      const merged = mergeTrendData(
        manual,
        internal,
        external,
        commissioning,
        granularity,
      );
      const result: QualityLossServiceTrendItem[] = [];

      if (isWeek) {
        [...merged.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([k, v]) => {
            result.push(formatTrendItem(`W${k}`, v));
          });
      } else {
        for (let k = 1; k <= 12; k++) {
          const v = merged.get(k) || {
            commissioning: 0,
            external: 0,
            internal: 0,
            manual: 0,
          };
          result.push(
            formatTrendItem(QL_CONSTANTS.MONTHS[k - 1] ?? `${k}月`, v),
          );
        }
      }

      return { trend: result };
    } catch (error) {
      logger.error({ err: error }, 'getTrendData 执行失败');
      return { trend: [] };
    }
  },

  /**
   * 获取所有损失记录（分页）— 直接查 quality_loss_index 物化表，DB 层分页
   */
  async getAllLosses(
    params: QualityLossQueryParams = {},
  ): Promise<PageResult<QualityLossItem>> {
    try {
      const { skip, take } = parsePagination(params);
      const where = await buildScopedIndexWhere(params);
      const [rows, total] = await Promise.all([
        prisma.quality_loss_index.findMany({
          where,
          orderBy: { occurDate: 'desc' },
          skip,
          take,
        }),
        prisma.quality_loss_index.count({ where }),
      ]);
      const items = await applyDeptNames(
        rows.map((row) => formatIndexRow(row)),
      );
      return { items, total };
    } catch (error) {
      logger.error({ err: error }, 'getAllLosses 执行失败');
      throw error;
    }
  },

  /**
   * 获取损益概览统计（全量数据，不分页）
   */
  async getExportRows(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
  ): Promise<QualityLossItem[]> {
    const where = await buildScopedIndexWhere(filters);
    // Bounded export read (PERF-QMS-001 / PHASE-1A): at most
    // EXPORT_QUERY_TAKE rows are read; the caller converts the N+1-th row
    // into EXPORT_LIMIT_EXCEEDED instead of loading the whole index.
    const rows = await prisma.quality_loss_index.findMany({
      where,
      orderBy: { occurDate: 'desc' },
      take: EXPORT_QUERY_TAKE,
    });
    return applyDeptNames(rows.map((row) => formatIndexRow(row)));
  },

  async getDashboardSummary(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize' | 'year'> = {},
  ): Promise<QualityLossDashboardSummary> {
    const where = await buildScopedIndexWhere(filters);
    const [summary, pendingSummary, dateGroups] = await Promise.all([
      prisma.quality_loss_index.aggregate({
        where,
        _sum: { actualClaim: true, amount: true },
      }),
      prisma.quality_loss_index.aggregate({
        where: {
          AND: [where, { status: { notIn: CONFIRMED_INDEX_STATUSES } }],
        },
        _sum: { actualClaim: true, amount: true },
      }),
      prisma.quality_loss_index.groupBy({
        by: ['occurDate'],
        where,
        _count: { id: true },
      }),
    ]);
    const totalAmount = Number(summary._sum.amount || 0);
    const totalClaim = Number(summary._sum.actualClaim || 0);
    const pendingAmount =
      Number(pendingSummary._sum.amount || 0) -
      Number(pendingSummary._sum.actualClaim || 0);
    const recoveryRate =
      totalAmount > 0 ? Math.round((totalClaim / totalAmount) * 1000) / 10 : 0;
    const years = [
      ...new Set(dateGroups.map((row) => row.occurDate.getFullYear())),
    ].sort((a, b) => b - a);
    return {
      kpi: {
        totalAmount: Number(totalAmount.toFixed(2)),
        totalClaim: Number(totalClaim.toFixed(2)),
        recoveryRate,
        displayRate: `${recoveryRate}%`,
        pendingAmount: Number(pendingAmount.toFixed(2)),
      },
      years: years.length > 0 ? years : [new Date().getFullYear()],
    };
  },

  async getYearlyCharts(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
  ): Promise<QualityLossCharts> {
    const where = await buildScopedIndexWhere(filters);
    const targetYear = Number(filters.year) || new Date().getFullYear();
    const granularity = filters.granularity || 'month';
    const yearWindow = buildShanghaiYearWindow(targetYear);
    // Department distribution and the month/week trend only include rows whose
    // Shanghai-local date falls in the target year. The year-granularity trend
    // spans every year present in the scoped set (same as the legacy service).
    const [deptGroups, dateGroups] = await Promise.all([
      prisma.quality_loss_index.groupBy({
        by: ['respDeptId'],
        where: { AND: [where, { occurDate: yearWindow }] },
        _sum: { amount: true },
        _max: { respDept: true },
      }),
      prisma.quality_loss_index.groupBy({
        by: ['occurDate'],
        where,
        _sum: { actualClaim: true, amount: true },
      }),
    ]);
    return {
      deptDistribution: await buildQualityLossDeptDistribution(deptGroups),
      trend: buildQualityLossYearlyTrend(dateGroups, {
        granularity,
        targetYear,
      }),
    };
  },

  /**
   * Delete a single record with audit logging
   */
  async deleteRecord(
    id: string,
    context: {
      dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
      userId: string;
    },
  ): Promise<void> {
    return QualityLossRecordMaintenanceService.deleteRecord(id, context);
  },

  /**
   * 批量删除记录
   */
  async batchDelete(
    ids: string[],
    context: {
      dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
      userId: string;
    },
  ): Promise<Prisma.BatchPayload> {
    return QualityLossRecordMaintenanceService.batchDelete(ids, context);
  },

  /**
   * 获取钻取明细数据
   */
  async getDrillDown(
    start: Date,
    end: Date,
    userContext?: { userId: string; username?: string },
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>,
  ) {
    return QualityLossRecordMaintenanceService.getDrillDown(
      start,
      end,
      userContext,
      dataScope,
    );
  },
};
