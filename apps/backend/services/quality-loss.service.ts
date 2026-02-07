import { Prisma, type after_sales_claimStatus, type quality_records_status } from '@prisma/client';
import {
  type PaginationParams,
  applyPagination,
  formatDateString,
  formatNumber,
  safeNumber,
} from './base.service';

import {
  type QualityLossItem,
  type QualityLossServiceTrendItem,
  type PageResult,
} from '@qgs/shared';

import { MONTHS } from '~/constants/locale';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

// 创建模块级 logger
const logger = createModuleLogger('QualityLossService');

// ============ 类型定义 ============

interface TrendRow {
  a: null | number | Prisma.Decimal | bigint;
  p: number | bigint;
}

interface TrendItem {
  external: number;
  internal: number;
  manual: number;
}

interface QualityLossQueryParams extends PaginationParams {
  lossSource?: string;
  status?: string;
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
function buildManualLossesWhere(params: QualityLossQueryParams): Prisma.quality_lossesWhereInput {
  return {
    isDeleted: false,
    ...(params.status ? { status: params.status } : {}),
  };
}

/**
 * 构建 quality_records 表的 where 条件
 */
function buildInternalRecordsWhere(params: QualityLossQueryParams): Prisma.quality_recordsWhereInput {
  return {
    isDeleted: false,
    lossAmount: { gt: 0 },
    ...(params.status
      ? { status: params.status as quality_records_status }
      : {}),
    ...(params.workOrderNumber
      ? { workOrderNumber: { contains: params.workOrderNumber } }
      : {}),
  };
}

/**
 * 构建 after_sales 表的 where 条件
 */
function buildExternalSalesWhere(params: QualityLossQueryParams): Prisma.after_salesWhereInput {
  return {
    isDeleted: false,
    ...(params.status
      ? { claimStatus: params.status as after_sales_claimStatus }
      : {}),
    ...(params.workOrderNumber
      ? { workOrderNumber: { contains: params.workOrderNumber } }
      : {}),
  };
}

// ============ 辅助函数：响应格式化 ============

/**
 * 格式化手工录入的损失记录
 */
function formatManualLossItem(
  item: {
    actualClaim: unknown;
    amount: unknown;
    id: string;
    lossId: string;
    occurDate: Date;
    respDept: null | string;
    status?: string;
    type: string;
    projectName?: string | null;
    workOrderNumber?: string | null;
  },
): QualityLossItem {
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
    status: item.status || QL_CONSTANTS.STATUS.PENDING,
  };
}

// ============ 状态映射处理 ============

function mapInternalStatus(status: string): string {
  if (status === 'CLOSED') return QL_CONSTANTS.STATUS.CONFIRMED;
  if (status === 'IN_PROGRESS' || status === 'CLAIMING') return 'Processing';
  if (status === 'RESOLVED') return 'Resolved';
  return QL_CONSTANTS.STATUS.PENDING;
}

function mapExternalStatus(status: string): string {
  if (status === 'CLOSED' || status === 'COMPLETED')
    return QL_CONSTANTS.STATUS.CONFIRMED;
  if (status === 'IN_PROGRESS' || ['NEGOTIATING', 'SUBMITTED'].includes(status))
    return 'Processing';
  if (status === 'RESOLVED') return 'Resolved';
  return QL_CONSTANTS.STATUS.PENDING;
}

/**
 * 格式化内部质量记录
 */
function formatInternalRecordItem(item: {
  createdAt: Date;
  date: Date;
  description: null | string;
  id: string;
  lossAmount: Prisma.Decimal | number | null;
  partName: null | string;
  projectName: null | string;
  recoveredAmount: Prisma.Decimal | number | null;
  responsibleDepartment: null | string;
  serialNumber: number;
  status: string;
  workOrderNumber: string | null;
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
  actualClaim: Prisma.Decimal | number | null;
  claimStatus: string;
  createdAt: Date;
  id: string;
  issueDescription: null | string;
  laborTravelCost: Prisma.Decimal | number | null;
  materialCost: Prisma.Decimal | number | null;
  occurDate: Date;
  partName: null | string;
  productSubtype: null | string;
  productType: null | string;
  projectName: null | string;
  respDept: null | string;
  serialNumber: number;
  workOrderNumber: string | null;
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
function formatTrendItem(period: string, item: TrendItem): QualityLossServiceTrendItem {
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
  async getTrendData(granularity: 'month' | 'week'): Promise<{ trend: QualityLossServiceTrendItem[] }> {
    const year = new Date().getFullYear();
    const isWeek = granularity === 'week';

    try {
      // Use Prisma.sql for safer raw queries
      const [manual, internal, external] = await Promise.all([
        isWeek
          ? prisma.$queryRaw<TrendRow[]>`SELECT WEEK(occurDate, 3) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<TrendRow[]>`SELECT MONTH(occurDate) as p, SUM(amount) as a FROM quality_losses WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`,
        isWeek
          ? prisma.$queryRaw<TrendRow[]>`SELECT WEEK(date, 3) as p, SUM(IFNULL(lossAmount, 0)) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<TrendRow[]>`SELECT MONTH(date) as p, SUM(IFNULL(lossAmount, 0)) as a FROM quality_records WHERE YEAR(date) = ${year} AND isDeleted = 0 GROUP BY p`,
        isWeek
          ? prisma.$queryRaw<TrendRow[]>`SELECT WEEK(occurDate, 3) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
          : prisma.$queryRaw<TrendRow[]>`SELECT MONTH(occurDate) as p, SUM(IFNULL(materialCost, 0) + IFNULL(laborTravelCost, 0)) as a FROM after_sales WHERE YEAR(occurDate) = ${year} AND isDeleted = 0 GROUP BY p`
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
  async getAllLosses(params: QualityLossQueryParams = {}): Promise<PageResult<QualityLossItem>> {
    const { lossSource, workOrderNumber } = params;

    try {
      // 1. 并行获取所有来源的原始数据
      const [manualRecords, internalRecords, externalRecords] =
        await Promise.all([
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

      const result: QualityLossItem[] = [];

      // 2. 处理手工录入记录
      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.MANUAL) {
        const filteredManual = workOrderNumber
          ? manualRecords.filter((r) => {
            const record = r as typeof r & { workOrderNumber?: string | null };
            return record.workOrderNumber?.includes(workOrderNumber);
          })
          : manualRecords;

        filteredManual.forEach((item) => {
          const itemRecord = item as typeof item & {
            projectName?: string | null;
            workOrderNumber?: string | null;
          };
          const amount = safeNumber(item.amount);
          if (amount <= 0) return;
          result.push(formatManualLossItem({ ...item, ...itemRecord }));
        });
      }

      // 3. 处理内部质量记录
      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.INTERNAL) {
        internalRecords.forEach((item) => {
          result.push(formatInternalRecordItem(item));
        });
      }

      // 4. 处理售后记录
      if (!lossSource || lossSource === QL_CONSTANTS.SOURCE.EXTERNAL) {
        externalRecords.forEach((item) => {
          const formatted = formatExternalSalesItem(item);
          if (formatted) result.push(formatted);
        });
      }

      // 5. 排序并分页
      const sorted = sortByDateDesc(result);
      return applyPagination(sorted, params);
    } catch (error) {
      logger.error({ err: error }, 'getAllLosses 执行失败');
      return { items: [], total: 0 };
    }
  },

  /**
   * 获取损益概览统计（全量数据，不分页）
   */
  async getLossSummary(
    filters: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
  ): Promise<QualityLossItem[]> {
    const { items } = await this.getAllLosses({
      ...filters,
      page: 1,
      pageSize: 100_000,
    });
    return items;
  },

  /**
   * 批量删除记录
   */
  async batchDelete(ids: string[]): Promise<Prisma.BatchPayload> {
    if (ids.length === 0) return { count: 0 };
    return prisma.quality_losses.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
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
