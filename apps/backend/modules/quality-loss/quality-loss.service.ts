import type {
  PageResult,
  QualityLossCharts,
  QualityLossDashboardSummary,
  QualityLossItem,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';

import type {
  QualityLossQueryParams,
  SingleQualityLossSource,
  TrendRow,
} from './quality-loss-format';

import { Prisma } from '@prisma/client';
import { isValidQualityLossStatus } from '@qgs/shared';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { flattenDeptTree } from '~/modules/dept/dept-tree';
import { DeptService } from '~/modules/dept/dept.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { normalizeQualityLossStatus } from '~/modules/quality-loss/quality-loss-status';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  applyPagination as paginateList,
  parsePagination,
  safeNumber,
} from '~/utils/query-helpers';

import { QualityLossDataScopeService } from './quality-loss-data-scope.service';
import {
  buildManualLossesWhere,
  formatCommissioningIssueItem,
  formatExternalSalesItem,
  formatInternalRecordItem,
  formatManualLossItem,
  formatTrendItem,
  mergeTrendData,
  normalizeLossSourceFilter,
  QL_CONSTANTS,
  sortByDateDesc,
} from './quality-loss-format';
import { QualityLossRecordMaintenanceService } from './quality-loss-record-maintenance.service';
import { QualityLossReportingService } from './quality-loss-reporting.service';
import { QualityLossRouteUpdateService } from './quality-loss-route-update.service';
import { QualityLossSummaryService } from './quality-loss-summary.service';

// 创建模块级 logger
const logger = createModuleLogger('QualityLossService');

type AggregationSourceRecords = {
  commissioningIssues: Awaited<
    ReturnType<typeof VehicleCommissioningService.getLossRecordsForAggregation>
  >;
  externalRecords: Awaited<
    ReturnType<typeof AfterSalesService.getLossRecordsForAggregation>
  >;
  internalRecords: Awaited<
    ReturnType<typeof InspectionService.getLossRecordsForAggregation>
  >;
  manualRecords: Awaited<ReturnType<typeof prisma.quality_losses.findMany>>;
};

async function resolveTrendRows(
  label: string,
  loader: () => Promise<TrendRow[]>,
): Promise<TrendRow[]> {
  try {
    return await loader();
  } catch (error) {
    logger.warn(
      { err: error, source: label },
      'Quality loss trend source failed',
    );
    return [];
  }
}

async function getDeptNameMapper() {
  const deptTree =
    (await DeptService.findAll().catch((error) => {
      logger.warn(
        { err: error },
        'DeptService.findAll failed, fallback to raw dept id',
      );
      return [];
    })) || [];
  const deptMap = new Map<string, string>();
  for (const node of flattenDeptTree(deptTree)) deptMap.set(node.id, node.name);
  return (id: null | string | undefined) => {
    if (!id) return null;
    return deptMap.get(id) || id;
  };
}

async function applyQualityLossDataScope(
  items: QualityLossItem[],
  userContext?: { userId: string; username?: string },
) {
  return QualityLossDataScopeService.apply(items, userContext);
}

function filterQualityLossItemsByStatus(
  items: QualityLossItem[],
  status?: string,
) {
  if (!status) return items;
  const trimmedStatus = status.trim();
  if (trimmedStatus === '') return items;
  if (!isValidQualityLossStatus(trimmedStatus)) return [];
  const normalizedStatus = normalizeQualityLossStatus(trimmedStatus);
  return items.filter(
    (item) => normalizeQualityLossStatus(item.status) === normalizedStatus,
  );
}

async function getSingleSourceLossPage(
  source: SingleQualityLossSource,
  params: QualityLossQueryParams,
): Promise<PageResult<QualityLossItem>> {
  const { skip, take } = parsePagination(params);
  const getDeptName = await getDeptNameMapper();
  const workOrderNumber = params.workOrderNumber;

  if (source === QL_CONSTANTS.SOURCE.MANUAL) {
    const baseWhere = buildManualLossesWhere(params);
    const where = params.userContext?.userId
      ? await QualityLossDataScopeService.applyManualWhere({
          baseWhere,
          dataScope: params.dataScope,
          userContext: params.userContext,
        })
      : baseWhere;
    const [rows, total] = await Promise.all([
      prisma.quality_losses.findMany({
        where,
        orderBy: { occurDate: 'desc' },
        skip,
        take,
      }),
      prisma.quality_losses.count({ where }),
    ]);
    const items = rows
      .filter((item) => safeNumber(item.amount) > 0)
      .map((item) => {
        const formatted = formatManualLossItem(item);
        formatted.responsibleDepartment = getDeptName(
          formatted.responsibleDepartment,
        );
        return formatted;
      });
    return { items, total };
  }

  let sourceRecords:
    | Awaited<ReturnType<typeof AfterSalesService.getLossRecordsForAggregation>>
    | Awaited<ReturnType<typeof InspectionService.getLossRecordsForAggregation>>
    | Awaited<
        ReturnType<
          typeof VehicleCommissioningService.getLossRecordsForAggregation
        >
      >;
  let total = 0;
  if (source === QL_CONSTANTS.SOURCE.INTERNAL) {
    [sourceRecords, total] = await Promise.all([
      InspectionService.getLossRecordsForAggregation({
        skip,
        take,
        workOrderNumber,
      }),
      InspectionService.countLossRecordsForAggregation({ workOrderNumber }),
    ]);
  } else if (source === QL_CONSTANTS.SOURCE.EXTERNAL) {
    [sourceRecords, total] = await Promise.all([
      AfterSalesService.getLossRecordsForAggregation({
        skip,
        take,
        workOrderNumber,
      }),
      AfterSalesService.countLossRecordsForAggregation({
        workOrderNumber,
      }),
    ]);
  } else {
    [sourceRecords, total] = await Promise.all([
      VehicleCommissioningService.getLossRecordsForAggregation({
        skip,
        take,
        workOrderNumber,
      }),
      VehicleCommissioningService.countLossRecordsForAggregation({
        workOrderNumber,
      }),
    ]);
  }

  const formatted = sourceRecords
    .map((item) => {
      if (source === QL_CONSTANTS.SOURCE.INTERNAL) {
        return formatInternalRecordItem(
          item as Parameters<typeof formatInternalRecordItem>[0],
        );
      }
      if (source === QL_CONSTANTS.SOURCE.EXTERNAL) {
        return formatExternalSalesItem(
          item as Parameters<typeof formatExternalSalesItem>[0],
        );
      }
      return formatCommissioningIssueItem(
        item as Parameters<typeof formatCommissioningIssueItem>[0],
      );
    })
    .filter(Boolean);
  const scoped = await applyQualityLossDataScope(
    filterQualityLossItemsByStatus(formatted, params.status).map((item) => ({
      ...item,
      responsibleDepartment: getDeptName(item.responsibleDepartment),
    })),
    params.userContext,
  );

  return { items: scoped, total };
}

async function getAllLossesUnpaginated(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
): Promise<QualityLossItem[]> {
  const sourceRecords = await fetchFromAllSources(params);
  const merged = await mergeAndFilter(sourceRecords, params);
  const { status, userContext } = params;
  let statusFiltered: QualityLossItem[];
  if (status && isValidQualityLossStatus(status.trim())) {
    statusFiltered = merged.filter(
      (item) =>
        normalizeQualityLossStatus(item.status) ===
        normalizeQualityLossStatus(status),
    );
  } else if (status) {
    statusFiltered = [];
  } else {
    statusFiltered = merged;
  }

  return QualityLossDataScopeService.sortFilteredByScope(
    statusFiltered,
    sortByDateDesc,
    userContext,
  );
}

async function fetchFromAllSources(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
): Promise<AggregationSourceRecords> {
  const workOrderNumber = params.workOrderNumber;
  const [manualRecords, internalRecords, externalRecords, commissioningIssues] =
    await Promise.all([
      prisma.quality_losses.findMany({
        where: buildManualLossesWhere(params),
      }),
      InspectionService.getLossRecordsForAggregation({ workOrderNumber }),
      AfterSalesService.getLossRecordsForAggregation({ workOrderNumber }),
      VehicleCommissioningService.getLossRecordsForAggregation({
        workOrderNumber,
      }).catch((error) => {
        logger.warn(
          { err: error },
          'vehicle_commissioning_issues query failed, skip commissioning quality loss source',
        );
        return [];
      }),
    ]);

  return {
    manualRecords,
    internalRecords,
    externalRecords,
    commissioningIssues,
  };
}

async function mergeAndFilter(
  sourceRecords: AggregationSourceRecords,
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
): Promise<QualityLossItem[]> {
  const { lossSource } = params;
  const getDeptName = await getDeptNameMapper();

  const result: QualityLossItem[] = [];

  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.MANUAL) {
    sourceRecords.manualRecords.forEach((item) => {
      const itemRecord = item as typeof item & {
        projectName?: null | string;
        workOrderNumber?: null | string;
      };
      const amount = safeNumber(item.amount);
      if (amount <= 0) return;
      const formatted = formatManualLossItem({ ...item, ...itemRecord });
      formatted.responsibleDepartment = getDeptName(
        formatted.responsibleDepartment,
      );
      result.push(formatted);
    });
  }

  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.INTERNAL) {
    sourceRecords.internalRecords.forEach((item) => {
      const formatted = formatInternalRecordItem(item);
      formatted.responsibleDepartment = getDeptName(
        formatted.responsibleDepartment,
      );
      result.push(formatted);
    });
  }

  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.EXTERNAL) {
    sourceRecords.externalRecords.forEach((item) => {
      const formatted = formatExternalSalesItem(item);
      if (formatted) {
        formatted.responsibleDepartment = getDeptName(
          formatted.responsibleDepartment,
        );
        result.push(formatted);
      }
    });
  }

  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.COMMISSIONING) {
    sourceRecords.commissioningIssues.forEach((item) => {
      const formatted = formatCommissioningIssueItem(item);
      formatted.responsibleDepartment = getDeptName(
        formatted.responsibleDepartment,
      );
      result.push(formatted);
    });
  }

  return result;
}

function applyPagination(
  items: QualityLossItem[],
  params: QualityLossQueryParams,
): PageResult<QualityLossItem> {
  return paginateList(items, params);
}

// ============ 主服务导出 ============

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
      const [manual, internal, external, commissioning] = await Promise.all([
        resolveTrendRows('manual', () =>
          isWeek
            ? prisma.$queryRaw<
                TrendRow[]
              >`SELECT WEEK(occurDate, 3) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
            : prisma.$queryRaw<
                TrendRow[]
              >`SELECT MONTH(occurDate) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        ),
        resolveTrendRows('internal', () =>
          InspectionService.getQualityLossTrendRows({ granularity, year }),
        ),
        resolveTrendRows('external', () =>
          AfterSalesService.getQualityLossTrendRows({ granularity, year }),
        ),
        resolveTrendRows('commissioning', () =>
          VehicleCommissioningService.getQualityLossTrendRows({
            granularity,
            year,
          }),
        ),
      ]);

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
   * 获取所有损失记录（分页）
   */
  async getAllLosses(
    params: QualityLossQueryParams = {},
  ): Promise<PageResult<QualityLossItem>> {
    try {
      const source = normalizeLossSourceFilter(params.lossSource);
      if (source) {
        return getSingleSourceLossPage(source, params);
      }
      const sorted = await getAllLossesUnpaginated(params);
      return applyPagination(sorted, params);
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
    return getAllLossesUnpaginated(filters);
  },

  async getDashboardSummary(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize' | 'year'> = {},
  ): Promise<QualityLossDashboardSummary> {
    const list = await getAllLossesUnpaginated(filters);
    return QualityLossSummaryService.getDashboardSummary(list);
  },

  async getYearlyCharts(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
  ): Promise<QualityLossCharts> {
    const list = await getAllLossesUnpaginated(filters);
    return QualityLossSummaryService.getYearlyCharts(list, filters);
  },

  /**
   * Delete a single record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    return QualityLossRecordMaintenanceService.deleteRecord(id, userId);
  },

  /**
   * 批量删除记录
   */
  async batchDelete(
    ids: string[],
    userId: string,
  ): Promise<Prisma.BatchPayload> {
    return QualityLossRecordMaintenanceService.batchDelete(ids, userId);
  },

  /**
   * 获取钻取明细数据
   */
  async getDrillDown(start: Date, end: Date) {
    return QualityLossRecordMaintenanceService.getDrillDown(start, end);
  },
};
