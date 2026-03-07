import type {
  PageResult,
  QualityLossItem,
  QualityLossServiceTrendItem,
} from '@qgs/shared';

import type { PaginationParams } from './base.service';

import { Prisma } from '@prisma/client';
import { MONTHS } from '~/constants/locale';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { normalizeQualityLossStatus } from '~/utils/quality-loss-status';

import {
  applyPagination,
  formatDateString,
  formatNumber,
  safeNumber,
} from './base.service';
import { DataScopeService } from './data-scope.service';
import { DeptService } from './dept.service';
import { SystemLogService } from './system-log.service';

// 创建模块级 logger
const logger = createModuleLogger('QualityLossService');

// ============ 类型定义 ============

interface TrendRow {
  a: bigint | null | number | Prisma.Decimal;
  p: bigint | number;
}

interface TrendItem {
  external: number;
  internal: number;
  manual: number;
}

interface QualityLossQueryParams extends PaginationParams {
  lossSource?: string;
  status?: string;
  userContext?: { userId: string; username?: string };
  workOrderNumber?: string;
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
function buildInternalRecordsWhere(
  params: QualityLossQueryParams,
): Prisma.quality_recordsWhereInput {
  return {
    isDeleted: false,
    lossAmount: { gt: 0 },
    ...(params.workOrderNumber
      ? { workOrderNumber: { contains: params.workOrderNumber } }
      : {}),
  };
}

/**
 * 构建 after_sales 表的 where 条件
 */
function buildExternalSalesWhere(
  params: QualityLossQueryParams,
): Prisma.after_salesWhereInput {
  return {
    isDeleted: false,
    ...(params.workOrderNumber
      ? { workOrderNumber: { contains: params.workOrderNumber } }
      : {}),
  };
}

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

// ============ 状态映射处理 ============

function mapInternalStatus(status: string): string {
  return normalizeQualityLossStatus(status);
}

function mapExternalStatus(status: string): string {
  return normalizeQualityLossStatus(status);
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
    status: mapInternalStatus(item.status),
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
    status: mapExternalStatus(item.claimStatus),
    type: QL_CONSTANTS.SOURCE.EXTERNAL,
    lossSource: QL_CONSTANTS.SOURCE.EXTERNAL,
    workOrderNumber: item.workOrderNumber || '-',
    projectName: item.projectName || '-',
    partName: item.partName || item.productSubtype || item.productType || '-',
    actualClaim: safeNumber(item.actualClaim),
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
  const { lossSource, status, userContext, workOrderNumber } = params;

  // 1. 并行获取所有来源的原始数据
  const [manualRecords, internalRecords, externalRecords] = await Promise.all([
    prisma.quality_losses.findMany({
      where: buildManualLossesWhere(params),
    }),
    prisma.quality_records.findMany({
      where: buildInternalRecordsWhere(params),
    }),
    prisma.after_sales.findMany({
      where: buildExternalSalesWhere(params),
    }),
  ]);

  // 部门树查询失败时不影响主流程，直接回退为原始部门ID
  const deptTree = ((await DeptService.findAll().catch((error) => {
    logger.warn(
      { err: error },
      'DeptService.findAll failed, fallback to raw dept id',
    );
    return [];
  })) || []) as any[];

  // Flatten dept tree for easy lookup
  const deptMap = new Map<string, string>();
  const processDeptNode = (nodes: any[]) => {
    nodes.forEach((node) => {
      deptMap.set(node.id, node.name);
      if (node.children && node.children.length > 0) {
        processDeptNode(node.children);
      }
    });
  };
  processDeptNode(deptTree);

  const getDeptName = (id: null | string | undefined) => {
    if (!id) return null;
    return deptMap.get(id) || id;
  };

  const result: QualityLossItem[] = [];

  // 2. 处理手工录入记录
  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.MANUAL) {
    const filteredManual = workOrderNumber
      ? manualRecords.filter((r) => {
          const record = r as typeof r & {
            workOrderNumber?: null | string;
          };
          return record.workOrderNumber?.includes(workOrderNumber);
        })
      : manualRecords;

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

  // 3. 处理内部质量记录
  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.INTERNAL) {
    internalRecords.forEach((item) => {
      const formatted = formatInternalRecordItem(item);
      formatted.responsibleDepartment = getDeptName(
        formatted.responsibleDepartment,
      );
      result.push(formatted);
    });
  }

  // 4. 处理售后记录
  if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.EXTERNAL) {
    externalRecords.forEach((item) => {
      const formatted = formatExternalSalesItem(item);
      if (formatted) {
        formatted.responsibleDepartment = getDeptName(
          formatted.responsibleDepartment,
        );
        result.push(formatted);
      }
    });
  }

  const statusFiltered = status
    ? result.filter(
        (item) =>
          normalizeQualityLossStatus(item.status) ===
          normalizeQualityLossStatus(status),
      )
    : result;

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

// ============ 辅助函数：趋势数据处理 ============

/**
 * 合并多个来源的趋势数据
 */
function mergeTrendData(
  manual: TrendRow[],
  internal: TrendRow[],
  external: TrendRow[],
  granularity: 'month' | 'week',
): Map<number, TrendItem> {
  const merged = new Map<number, TrendItem>();

  const process = (rows: TrendRow[], key: keyof TrendItem) => {
    rows.forEach((r) => {
      const p = Number(r.p);
      if (p === 0 && granularity !== 'week') return; // WEEK() can be 0, MONTH() is 1-12
      let item = merged.get(p);
      if (!item) {
        item = { external: 0, internal: 0, manual: 0 };
        merged.set(p, item);
      }
      item[key] += safeNumber(r.a);
    });
  };

  process(manual, 'manual');
  process(internal, 'internal');
  process(external, 'external');

  return merged;
}

/**
 * 格式化趋势数据项
 */
function formatTrendItem(
  period: string,
  item: TrendItem,
): QualityLossServiceTrendItem {
  const total = item.manual + item.internal + item.external;
  return {
    period,
    totalAmount: formatNumber(total),
    manualAmount: formatNumber(item.manual),
    internalAmount: formatNumber(item.internal),
    externalAmount: formatNumber(item.external),
  };
}

// ============ 主服务导出 ============

export const QualityLossService = {
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
      const [manual, internal, external] = await Promise.all([
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
      ]);

      const merged = mergeTrendData(manual, internal, external, granularity);
      const result: QualityLossServiceTrendItem[] = [];

      if (isWeek) {
        [...merged.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([k, v]) => {
            result.push(formatTrendItem(`W${k}`, v));
          });
      } else {
        for (let k = 1; k <= 12; k++) {
          const v = merged.get(k) || { external: 0, internal: 0, manual: 0 };
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
      details: 'Soft deleted quality loss record',
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
      details: `Batch soft deleted ${result.count} quality loss records`,
    });

    return result;
  },

  /**
   * 获取钻取明细数据
   */
  async getDrillDown(start: Date, end: Date) {
    const [manualLosses, internalLosses, externalLosses] = await Promise.all([
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
    ]);

    return { manualLosses, internalLosses, externalLosses };
  },
};
