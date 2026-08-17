import type {
  PageResult,
  QualityLossCharts,
  QualityLossDashboardSummary,
  QualityLossItem,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type { QualityLossQueryParams, TrendRow } from './quality-loss-format';

import { Prisma } from '@prisma/client';
import { createIdentityAggregateItem } from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
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
import { QualityLossSummaryService } from './quality-loss-summary.service';

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

async function loadAllScopedItems(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
): Promise<QualityLossItem[]> {
  const where = await buildScopedIndexWhere(params);
  const rows = await prisma.quality_loss_index.findMany({
    where,
    orderBy: { occurDate: 'desc' },
  });
  return applyDeptNames(rows.map((row) => formatIndexRow(row)));
}

export const QualityLossService = {
  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    return QualityLossReportingService.getStatsForDashboard(params);
  },

  async getWeeklyTrackingIssues(params: {
    closedStatuses: string[];
    end: Date;
    start: Date;
    take?: number;
  }) {
    return QualityLossReportingService.getWeeklyTrackingIssues(params);
  },

  async getReportPeriodMetrics(params: { end: Date; start: Date }) {
    return QualityLossReportingService.getReportPeriodMetrics(params);
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
  ): Promise<{ trend: QualityLossServiceTrendItem[] }> {
    const year = new Date().getFullYear();
    const isWeek = granularity === 'week';

    try {
      // 统一出口：直接查询 quality_loss_index 物化表（四源口径在写入时统一：
      // Internal amount>0 / External isClaim||amount>0 / Commissioning isClaim||amount>0 / Manual amount>0）。
      // 不再调用各源模块的直查函数（已退役，见 metrics-registry M-B03）。
      const rows = await prisma.$queryRaw<
        Array<{
          a: bigint | null | number | Prisma.Decimal;
          p: bigint | number;
          source: string;
        }>
      >`SELECT ${isWeek ? 'WEEK(occurDate, 3)' : 'MONTH(occurDate)'} as p, source, SUM(amount) as a
        FROM quality_loss_index
        WHERE YEAR(occurDate) = ${year} AND isDeleted = 0
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
  async getLossSummary(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
  ): Promise<QualityLossItem[]> {
    return loadAllScopedItems(filters);
  },

  async getDashboardSummary(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize' | 'year'> = {},
  ): Promise<QualityLossDashboardSummary> {
    const list = await loadAllScopedItems(filters);
    return QualityLossSummaryService.getDashboardSummary(list);
  },

  async getYearlyCharts(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
  ): Promise<QualityLossCharts> {
    const list = await loadAllScopedItems(filters);
    return QualityLossSummaryService.getYearlyCharts(list, filters);
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
  async getDrillDown(start: Date, end: Date) {
    return QualityLossRecordMaintenanceService.getDrillDown(start, end);
  },
};
