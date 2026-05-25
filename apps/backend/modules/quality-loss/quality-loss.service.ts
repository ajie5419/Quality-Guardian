import type {
  PageResult,
  QualityLossItem,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
import type { QualityLossSource } from '~/utils/quality-loss-status';
import type { PaginationParams } from '~/utils/query-helpers';

import { Prisma } from '@prisma/client';
import { AUDIT_TEMPLATES } from '@qgs/shared';
import { AfterSalesService } from '~/modules/after-sales/after-sales.service';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import { DeptService } from '~/modules/dept/dept.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { MONTHS } from '~/modules/quality-loss/locale';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { VehicleCommissioningService } from '~/modules/vehicle-commissioning/vehicle-commissioning.service';
import { flattenDeptTree } from '~/utils/dept-tree';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  normalizeQualityLossSource,
  normalizeQualityLossStatus,
  QUALITY_LOSS_SOURCE,
  toAfterSalesClaimStatus,
  toQualityLossTargetType,
  toQualityRecordStatus,
} from '~/utils/quality-loss-status';
import {
  parseQualityLossUpdateBody,
  resolveQualityLossUpdateTarget,
} from '~/utils/quality-loss-update';
import {
  formatDateString,
  formatNumber,
  applyPagination as paginateList,
  safeNumber,
} from '~/utils/query-helpers';

// 创建模块级 logger
const logger = createModuleLogger('QualityLossService');

// ============ 类型定义 ============

interface TrendRow {
  a: bigint | null | number | Prisma.Decimal;
  p: bigint | number;
}

interface TrendItem {
  commissioning: number;
  external: number;
  internal: number;
  manual: number;
}

interface QualityLossQueryParams extends PaginationParams {
  granularity?: 'month' | 'week' | 'year';
  lossSource?: string;
  status?: string;
  userContext?: { userId: string; username?: string };
  workOrderNumber?: string;
  year?: number;
}

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

type QualityLossDashboardSummary = {
  kpi: {
    displayRate: string;
    pendingAmount: number;
    recoveryRate: number;
    totalAmount: number;
    totalClaim: number;
  };
  years: number[];
};

type QualityLossYearlyCharts = {
  deptDistribution: Array<{ name: string; value: number }>;
  trend: Array<{
    claimAmount: number;
    period: number;
    periodLabel: string;
    totalAmount: number;
  }>;
};

function getWeekOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOffset = (start.getDay() + 6) % 7;
  const dayOfYear =
    Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.ceil((dayOfYear + dayOffset) / 7);
}

// ============ 常量定义 ============

const QL_CONSTANTS = {
  MONTHS,
  STATUS: {
    CLOSED: 'CLOSED',
    CONFIRMED: 'Confirmed',
    PENDING: 'Pending',
  },
  SOURCE: {
    COMMISSIONING: 'Commissioning',
    MANUAL: 'Manual',
    INTERNAL: 'Internal',
    EXTERNAL: 'External',
  },
} as const;

// ============ 辅助函数：Where 条件构建 ============

/**
 * 构建 quality_losses 表的 where 条件
 */
function buildManualLossesWhere(
  _params: QualityLossQueryParams,
): Prisma.quality_lossesWhereInput {
  return {
    isDeleted: false,
  };
}

/**
 * 构建 quality_records 表的 where 条件
 */
// ============ 辅助函数：响应格式化 ============

/**
 * 格式化手工录入的损失记录
 */
function formatManualLossItem(item: {
  actualClaim: unknown;
  amount: unknown;
  id: string;
  lossId: string;
  occurDate: Date;
  projectName?: null | string;
  respDept: null | string;
  status?: string;
  type: string;
  workOrderNumber?: null | string;
}): QualityLossItem {
  return {
    id: item.lossId || item.id,
    pk: item.id,
    date: formatDateString(item.occurDate),
    responsibleDepartment: item.respDept,
    lossSource: QL_CONSTANTS.SOURCE.MANUAL,
    workOrderNumber: item.workOrderNumber || '-',
    projectName: item.projectName || '-',
    partName: item.type,
    amount: safeNumber(item.amount),
    actualClaim: safeNumber(item.actualClaim),
    status: normalizeQualityLossStatus(
      item.status || QL_CONSTANTS.STATUS.PENDING,
    ),
  };
}

/**
 * 格式化内部质量记录
 */
function formatInternalRecordItem(item: {
  createdAt: Date;
  date: Date;
  description: null | string;
  id: string;
  lossAmount: null | number | Prisma.Decimal;
  partName: null | string;
  projectName: null | string;
  recoveredAmount: null | number | Prisma.Decimal;
  responsibleDepartment: null | string;
  serialNumber: number;
  status: string;
  workOrderNumber: null | string;
}): QualityLossItem {
  return {
    id: `INT-${item.serialNumber}`,
    pk: item.id,
    date: formatDateString(item.date),
    amount: safeNumber(item.lossAmount),
    responsibleDepartment: item.responsibleDepartment,
    description: item.description || undefined,
    status: normalizeQualityLossStatus(item.status),
    type: QL_CONSTANTS.SOURCE.INTERNAL,
    lossSource: QL_CONSTANTS.SOURCE.INTERNAL,
    workOrderNumber: item.workOrderNumber || '-',
    projectName: item.projectName || '-',
    partName: item.partName || '-',
    actualClaim: safeNumber(item.recoveredAmount),
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * 格式化售后记录
 */
function formatExternalSalesItem(item: {
  actualClaim: null | number | Prisma.Decimal;
  claimStatus: string;
  createdAt: Date;
  id: string;
  issueDescription: null | string;
  laborTravelCost: null | number | Prisma.Decimal;
  materialCost: null | number | Prisma.Decimal;
  occurDate: Date;
  partName: null | string;
  productSubtype: null | string;
  productType: null | string;
  projectName: null | string;
  respDept: null | string;
  serialNumber: number;
  workOrderNumber: null | string;
}): null | QualityLossItem {
  const amount =
    safeNumber(item.materialCost) + safeNumber(item.laborTravelCost);
  if (amount <= 0) return null;

  return {
    id: `EXT-${item.serialNumber}`,
    pk: item.id,
    date: formatDateString(item.occurDate),
    amount,
    responsibleDepartment: item.respDept,
    description: item.issueDescription || undefined,
    status: normalizeQualityLossStatus(item.claimStatus),
    type: QL_CONSTANTS.SOURCE.EXTERNAL,
    lossSource: QL_CONSTANTS.SOURCE.EXTERNAL,
    workOrderNumber: item.workOrderNumber || '-',
    projectName: item.projectName || '-',
    partName: item.partName || item.productSubtype || item.productType || '-',
    actualClaim: safeNumber(item.actualClaim),
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * 格式化调试验收问题产生的质量损失。
 */
function formatCommissioningIssueItem(item: {
  claimNotes: null | string;
  claimStatus: string;
  createdAt: Date;
  date: Date;
  description: null | string;
  id: string;
  lossAmount: null | number | Prisma.Decimal;
  partName: null | string;
  projectName: null | string;
  recoveredAmount: null | number | Prisma.Decimal;
  responsibleDepartment: null | string;
  workOrderNumber: null | string;
}): QualityLossItem {
  return {
    id: item.id,
    pk: item.id,
    date: formatDateString(item.date),
    amount: safeNumber(item.lossAmount),
    responsibleDepartment: item.responsibleDepartment,
    description: item.claimNotes || item.description || undefined,
    status: normalizeQualityLossStatus(item.claimStatus),
    type: QL_CONSTANTS.SOURCE.COMMISSIONING,
    lossSource: QL_CONSTANTS.SOURCE.COMMISSIONING,
    workOrderNumber: item.workOrderNumber || '-',
    projectName: item.projectName || '-',
    partName: item.partName || '-',
    actualClaim: safeNumber(item.recoveredAmount),
    createdAt: item.createdAt.toISOString(),
  };
}

// ============ 辅助函数：排序 ============

/**
 * 按日期降序排序
 */
function sortByDateDesc(items: QualityLossItem[]): QualityLossItem[] {
  return items.sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
}

async function getAllLossesUnpaginated(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'> = {},
): Promise<QualityLossItem[]> {
  const sourceRecords = await fetchFromAllSources(params);
  const merged = await mergeAndFilter(sourceRecords, params);
  const { status, userContext } = params;
  const statusFiltered = status
    ? merged.filter(
        (item) =>
          normalizeQualityLossStatus(item.status) ===
          normalizeQualityLossStatus(status),
      )
    : merged;

  if (!userContext?.userId) {
    return sortByDateDesc(statusFiltered);
  }

  const scope = await DataScopeService.getScopeForModule(
    userContext.userId,
    'quality-loss',
  );
  if (scope.scopeType === 'ALL') {
    return sortByDateDesc(statusFiltered);
  }

  if (scope.scopeType === 'DEPT') {
    const deptCandidates = await DataScopeService.getDeptCandidates(
      scope.deptIds,
    );
    return sortByDateDesc(
      statusFiltered.filter((item) =>
        deptCandidates.includes(String(item.responsibleDepartment || '')),
      ),
    );
  }

  // 质量损失聚合记录缺少稳定“责任人账号”字段，SELF 先按用户部门口径兜底。
  const deptFallback = await DataScopeService.getScopeForModule(
    userContext.userId,
    'supplier',
  );
  const deptCandidates = await DataScopeService.getDeptCandidates(
    deptFallback.deptIds,
  );
  return sortByDateDesc(
    statusFiltered.filter((item) =>
      deptCandidates.includes(String(item.responsibleDepartment || '')),
    ),
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
  const { lossSource, workOrderNumber } = params;

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
  const getDeptName = (id: null | string | undefined) => {
    if (!id) return null;
    return deptMap.get(id) || id;
  };

  const result: QualityLossItem[] = [];

  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.MANUAL) {
    const filteredManual = workOrderNumber
      ? sourceRecords.manualRecords.filter((r) => {
          const record = r as typeof r & {
            workOrderNumber?: null | string;
          };
          return record.workOrderNumber?.includes(workOrderNumber);
        })
      : sourceRecords.manualRecords;
    filteredManual.forEach((item) => {
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

// ============ 辅助函数：趋势数据处理 ============

/**
 * 合并多个来源的趋势数据
 */
function mergeTrendData(
  manual: TrendRow[],
  internal: TrendRow[],
  external: TrendRow[],
  commissioning: TrendRow[],
  granularity: 'month' | 'week',
): Map<number, TrendItem> {
  const merged = new Map<number, TrendItem>();

  const process = (rows: TrendRow[], key: keyof TrendItem) => {
    rows.forEach((r) => {
      const p = Number(r.p);
      if (p === 0 && granularity !== 'week') return; // WEEK() can be 0, MONTH() is 1-12
      let item = merged.get(p);
      if (!item) {
        item = { commissioning: 0, external: 0, internal: 0, manual: 0 };
        merged.set(p, item);
      }
      item[key] += safeNumber(r.a);
    });
  };

  process(manual, 'manual');
  process(internal, 'internal');
  process(external, 'external');
  process(commissioning, 'commissioning');

  return merged;
}

/**
 * 格式化趋势数据项
 */
function formatTrendItem(
  period: string,
  item: TrendItem,
): QualityLossServiceTrendItem {
  const total =
    item.manual + item.internal + item.external + item.commissioning;
  return {
    period,
    totalAmount: formatNumber(total),
    manualAmount: formatNumber(item.manual),
    internalAmount: formatNumber(item.internal),
    externalAmount: formatNumber(item.external),
    commissioningAmount: formatNumber(item.commissioning),
  };
}

// ============ 主服务导出 ============

export const QualityLossService = {
  async getStatsForDashboard(params: { weekStart: Date; yearStart: Date }) {
    const baseWhere = { isDeleted: false };
    const [yearAggregate, weekAggregate] = await Promise.all([
      prisma.quality_losses.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.yearStart } },
        _sum: { amount: true },
      }),
      prisma.quality_losses.aggregate({
        where: { ...baseWhere, occurDate: { gte: params.weekStart } },
        _sum: { amount: true },
      }),
    ]);
    return {
      totalLoss: Number(yearAggregate._sum.amount || 0),
      weeklyLoss: Number(weekAggregate._sum.amount || 0),
    };
  },

  async updateByRouteId(params: {
    body: Record<string, unknown>;
    id: string;
    userId: string;
  }) {
    const source = normalizeQualityLossSource(
      params.body.lossSource as string | undefined,
    );
    const parsedBody = parseQualityLossUpdateBody(params.body);
    if ('message' in parsedBody) {
      return {
        ok: false as const,
        code: 'BAD_REQUEST' as const,
        message: parsedBody.message,
      };
    }

    const target = await resolveQualityLossUpdateTarget({
      client: prisma,
      pathId: params.id,
      pk: params.body.pk,
      source,
    });
    if ('message' in target) {
      return {
        ok: false as const,
        code: 'BAD_REQUEST' as const,
        message: target.message,
      };
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (target.source === QUALITY_LOSS_SOURCE.INTERNAL) {
          await tx.quality_records.update({
            where: target.where,
            data: {
              recoveredAmount: parsedBody.actualClaim,
              ...(parsedBody.status
                ? { status: toQualityRecordStatus(parsedBody.status) }
                : {}),
              updatedAt: new Date(),
            },
          });
          return;
        }
        if (target.source === QUALITY_LOSS_SOURCE.EXTERNAL) {
          await tx.after_sales.update({
            where: target.where,
            data: {
              actualClaim: parsedBody.actualClaim,
              ...(parsedBody.status
                ? { claimStatus: toAfterSalesClaimStatus(parsedBody.status) }
                : {}),
              updatedAt: new Date(),
            },
          });
          return;
        }
        if (target.source === QUALITY_LOSS_SOURCE.COMMISSIONING) {
          await tx.vehicle_commissioning_issues.update({
            where: target.where,
            data: {
              ...(parsedBody.amount === undefined
                ? {}
                : { lossAmount: parsedBody.amount }),
              ...(parsedBody.actualClaim === undefined
                ? {}
                : { recoveredAmount: parsedBody.actualClaim }),
              ...(parsedBody.status ? { claimStatus: parsedBody.status } : {}),
              updatedAt: new Date(),
            },
          });
          return;
        }
        await tx.quality_losses.update({
          where: target.where,
          data: {
            ...(parsedBody.occurDate
              ? { occurDate: parsedBody.occurDate }
              : {}),
            ...(parsedBody.type ? { type: parsedBody.type } : {}),
            ...(parsedBody.amount === undefined
              ? {}
              : { amount: parsedBody.amount }),
            ...(parsedBody.actualClaim === undefined
              ? {}
              : { actualClaim: parsedBody.actualClaim }),
            ...(parsedBody.respDept === undefined
              ? {}
              : { respDept: parsedBody.respDept }),
            ...(params.body.description === undefined
              ? {}
              : { description: params.body.description }),
            ...(parsedBody.status ? { status: parsedBody.status } : {}),
            updatedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        return {
          ok: false as const,
          code: 'NOT_FOUND' as const,
          message: '目标记录不存在',
        };
      }
      const err = error as { message?: string };
      return {
        ok: false as const,
        code: 'INTERNAL' as const,
        message: `数据更新失败：${err.message || '数据库操作异常'}`,
      };
    }

    await SystemLogService.recordAuditLog({
      userId: params.userId,
      action: 'UPDATE',
      targetType: toQualityLossTargetType(source as QualityLossSource),
      targetId: String(params.id),
      detailsTemplate: '修改质量损失相关记录: {{id}}{{sourcePart}}',
      detailsVariables: {
        id: params.id,
        sourcePart:
          source === QUALITY_LOSS_SOURCE.MANUAL ? '' : ` (${source} 来源)`,
      },
    });
    return { ok: true as const };
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
      // Use Prisma.sql for safer raw queries
      const [manual, internal, external, commissioning] = await Promise.all([
        isWeek
          ? prisma.$queryRaw<
              TrendRow[]
            >`SELECT WEEK(occurDate, 3) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<
              TrendRow[]
            >`SELECT MONTH(occurDate) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        isWeek
          ? prisma.$queryRaw<
              TrendRow[]
            >`SELECT WEEK(date, 3) as p, SUM(IFNULL(lossAmount, 0)) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<
              TrendRow[]
            >`SELECT MONTH(date) as p, SUM(IFNULL(lossAmount, 0)) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`,
        isWeek
          ? prisma.$queryRaw<
              TrendRow[]
            >`SELECT WEEK(occurDate, 3) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<
              TrendRow[]
            >`SELECT MONTH(occurDate) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        isWeek
          ? prisma.$queryRaw<
              TrendRow[]
            >`SELECT WEEK(date, 3) as p, SUM(IFNULL(lossAmount, 0)) as a FROM vehicle_commissioning_issues WHERE YEAR(date) = ${year} AND isDeleted = 0 AND (isClaim = 1 OR IFNULL(lossAmount, 0) > 0) GROUP BY p`
          : prisma.$queryRaw<
              TrendRow[]
            >`SELECT MONTH(date) as p, SUM(IFNULL(lossAmount, 0)) as a FROM vehicle_commissioning_issues WHERE YEAR(date) = ${year} AND isDeleted = 0 AND (isClaim = 1 OR IFNULL(lossAmount, 0) > 0) GROUP BY p`,
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
    const totalAmount = list.reduce(
      (sum, item) => sum + (Number(item.amount) || 0),
      0,
    );
    const totalClaim = list.reduce(
      (sum, item) => sum + (Number(item.actualClaim) || 0),
      0,
    );
    const recoveryRate =
      totalAmount > 0 ? Math.round((totalClaim / totalAmount) * 1000) / 10 : 0;
    let pendingAmount = 0;
    for (const item of list) {
      const status = normalizeQualityLossStatus(item.status);
      if (
        status === 'Pending' ||
        status === 'Processing' ||
        status === 'Resolved'
      ) {
        pendingAmount +=
          (Number(item.amount) || 0) - (Number(item.actualClaim) || 0);
      }
    }

    const years = [
      ...new Set(
        list
          .map((item) => {
            const time = new Date(item.date || '').getTime();
            if (Number.isNaN(time)) return null;
            return new Date(time).getFullYear();
          })
          .filter((year): year is number => year !== null),
      ),
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
  ): Promise<QualityLossYearlyCharts> {
    const targetYear = Number(filters.year) || new Date().getFullYear();
    const granularity = filters.granularity || 'month';
    const list = await getAllLossesUnpaginated(filters);
    const filteredByYear = list.filter((item) => {
      const time = new Date(item.date || '').getTime();
      if (Number.isNaN(time)) return false;
      return new Date(time).getFullYear() === targetYear;
    });

    const deptMap = new Map<string, number>();
    for (const item of filteredByYear) {
      const name = String(item.responsibleDepartment || '未指定部门');
      const amount = Number(item.amount) || 0;
      deptMap.set(name, (deptMap.get(name) || 0) + amount);
    }
    const deptDistribution = [...deptMap.entries()]
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);

    const trendMap = new Map<
      number,
      { claimAmount: number; totalAmount: number }
    >();
    const upsertTrend = (key: number, amount: number, claimAmount: number) => {
      const current = trendMap.get(key) || { totalAmount: 0, claimAmount: 0 };
      current.totalAmount += amount;
      current.claimAmount += claimAmount;
      trendMap.set(key, current);
    };

    for (const item of list) {
      const date = new Date(item.date || '');
      if (Number.isNaN(date.getTime())) continue;
      const amount = Number(item.amount) || 0;
      const claimAmount = Number(item.actualClaim) || 0;
      if (granularity === 'year') {
        upsertTrend(date.getFullYear(), amount, claimAmount);
        continue;
      }
      if (date.getFullYear() !== targetYear) continue;
      if (granularity === 'week') {
        upsertTrend(getWeekOfYear(date), amount, claimAmount);
      } else {
        upsertTrend(date.getMonth() + 1, amount, claimAmount);
      }
    }

    let trend: QualityLossYearlyCharts['trend'] = [];
    if (granularity === 'year') {
      trend = [...trendMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([period, value]) => ({
          period,
          periodLabel: `${period}年`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        }));
    } else if (granularity === 'week') {
      const maxWeek = 53;
      trend = Array.from({ length: maxWeek }).map((_, index) => {
        const period = index + 1;
        const value = trendMap.get(period) || {
          totalAmount: 0,
          claimAmount: 0,
        };
        return {
          period,
          periodLabel: `W${period}`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        };
      });
    } else {
      trend = Array.from({ length: 12 }).map((_, index) => {
        const period = index + 1;
        const value = trendMap.get(period) || {
          totalAmount: 0,
          claimAmount: 0,
        };
        return {
          period,
          periodLabel: `${period}月`,
          totalAmount: Number(value.totalAmount.toFixed(2)),
          claimAmount: Number(value.claimAmount.toFixed(2)),
        };
      });
    }

    return {
      deptDistribution,
      trend,
    };
  },

  /**
   * Delete a single record with audit logging
   */
  async deleteRecord(id: string, userId: string): Promise<void> {
    const target = await prisma.quality_losses.findFirst({
      where: {
        isDeleted: false,
        OR: [{ id }, { lossId: id }],
      },
      select: { id: true },
    });

    if (!target) {
      const notFoundError = new Error(
        'Quality loss record not found',
      ) as Error & {
        code?: string;
      };
      notFoundError.code = 'NOT_FOUND';
      throw notFoundError;
    }

    await prisma.quality_losses.update({
      where: { id: target.id },
      data: { isDeleted: true },
    });

    await SystemLogService.recordAuditLog({
      userId,
      action: 'DELETE',
      targetType: 'quality_loss',
      targetId: target.id,
      detailsTemplate: AUDIT_TEMPLATES.QUALITY_LOSS_SOFT_DELETE,
      detailsVariables: {},
    });
  },

  /**
   * 批量删除记录
   */
  async batchDelete(
    ids: string[],
    userId: string,
  ): Promise<Prisma.BatchPayload> {
    const normalizedIds = [
      ...new Set(ids.map((item) => String(item).trim()).filter(Boolean)),
    ];
    if (normalizedIds.length === 0) return { count: 0 };

    const targets = await prisma.quality_losses.findMany({
      where: {
        isDeleted: false,
        OR: [{ id: { in: normalizedIds } }, { lossId: { in: normalizedIds } }],
      },
      select: { id: true },
    });

    if (targets.length === 0) return { count: 0 };

    const result = await prisma.quality_losses.updateMany({
      where: { id: { in: targets.map((target) => target.id) } },
      data: { isDeleted: true },
    });

    await SystemLogService.recordAuditLog({
      userId,
      action: 'DELETE',
      targetType: 'quality_loss',
      targetId: normalizedIds.join(','),
      detailsTemplate: AUDIT_TEMPLATES.QUALITY_LOSS_BATCH_SOFT_DELETE,
      detailsVariables: {
        count: result.count,
      },
    });

    return result;
  },

  /**
   * 获取钻取明细数据
   */
  async getDrillDown(start: Date, end: Date) {
    const [manualLosses, internalLosses, externalLosses, commissioningLosses] =
      await Promise.all([
        prisma.quality_losses.findMany({
          where: {
            isDeleted: false,
            occurDate: { gte: start, lte: end },
          },
        }),
        prisma.quality_records.findMany({
          where: {
            isDeleted: false,
            date: { gte: start, lte: end },
            lossAmount: { gt: 0 },
          },
        }),
        prisma.after_sales.findMany({
          where: {
            isDeleted: false,
            occurDate: { gte: start, lte: end },
          },
        }),
        prisma.vehicle_commissioning_issues.findMany({
          where: {
            isDeleted: false,
            date: { gte: start, lte: end },
            OR: [{ isClaim: true }, { lossAmount: { gt: 0 } }],
          },
        }),
      ]);

    return {
      manualLosses,
      internalLosses,
      externalLosses,
      commissioningLosses,
    };
  },
};
