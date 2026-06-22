import type {
  QualityLossItem,
  QualityLossParams,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
import type { ResolvedDataScope } from '~/modules/data-scope/data-scope.service';
import type { PaginationParams } from '~/utils/query-helpers';

import { Prisma } from '@prisma/client';
import { isValidQualityLossStatus } from '@qgs/shared';
import { MONTHS } from '~/modules/quality-loss/locale';
import {
  normalizeQualityLossSource,
  normalizeQualityLossStatus,
} from '~/modules/quality-loss/quality-loss-status';
import {
  formatDateString,
  formatNumber,
  safeNumber,
} from '~/utils/query-helpers';

export interface TrendRow {
  a: bigint | null | number | Prisma.Decimal;
  p: bigint | number;
}

interface TrendItem {
  commissioning: number;
  external: number;
  internal: number;
  manual: number;
}

export type QualityLossQueryParams = PaginationParams &
  QualityLossParams & {
    dataScope?: Pick<ResolvedDataScope, 'deptIds' | 'scopeType'>;
  };

export const QL_CONSTANTS = {
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

export type SingleQualityLossSource =
  | typeof QL_CONSTANTS.SOURCE.COMMISSIONING
  | typeof QL_CONSTANTS.SOURCE.EXTERNAL
  | typeof QL_CONSTANTS.SOURCE.INTERNAL
  | typeof QL_CONSTANTS.SOURCE.MANUAL;

export function getWeekOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOffset = (start.getDay() + 6) % 7;
  const dayOfYear =
    Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.ceil((dayOfYear + dayOffset) / 7);
}

export function buildManualLossesWhere(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
): Prisma.quality_lossesWhereInput {
  const where: Prisma.quality_lossesWhereInput = {
    isDeleted: false,
  };
  if (params.status) {
    const trimmedStatus = params.status.trim();
    where.status = isValidQualityLossStatus(trimmedStatus)
      ? normalizeQualityLossStatus(trimmedStatus)
      : '__INVALID__';
  }
  if (params.year) {
    where.occurDate = {
      gte: new Date(`${params.year}-01-01T00:00:00.000Z`),
      lte: new Date(`${params.year}-12-31T23:59:59.999Z`),
    };
  }
  return where;
}

export function buildIndexWhere(
  params: Omit<QualityLossQueryParams, 'page' | 'pageSize'>,
): Prisma.quality_loss_indexWhereInput {
  const where: Prisma.quality_loss_indexWhereInput = {
    isDeleted: false,
  };
  const source = normalizeLossSourceFilter(params.lossSource);
  if (source) {
    where.source = source;
  }
  if (params.status) {
    const trimmedStatus = params.status.trim();
    if (!isValidQualityLossStatus(trimmedStatus)) {
      where.status = '__INVALID__';
    }
    // Status normalization happens at row formatting; leave the raw column alone.
  }
  if (params.workOrderNumber && String(params.workOrderNumber).trim() !== '') {
    where.workOrderNumber = {
      contains: String(params.workOrderNumber).trim(),
    };
  }
  if (params.year) {
    where.occurDate = {
      gte: new Date(`${params.year}-01-01T00:00:00.000Z`),
      lte: new Date(`${params.year}-12-31T23:59:59.999Z`),
    };
  }
  return where;
}

interface IndexRowLike {
  actualClaim: null | number | Prisma.Decimal;
  amount: null | number | Prisma.Decimal;
  createdBy: null | string;
  description: null | string;
  id: string;
  indexedAt: Date;
  occurDate: Date;
  partName: null | string;
  projectName: null | string;
  respDept: null | string;
  source: string;
  sourcePk: string;
  status: string;
  workOrderNumber: null | string;
}

export function formatIndexRow(row: IndexRowLike): QualityLossItem {
  return {
    id: row.id,
    pk: row.sourcePk,
    date: formatDateString(row.occurDate),
    amount: safeNumber(row.amount),
    actualClaim: safeNumber(row.actualClaim),
    responsibleDepartment: row.respDept,
    description: row.description || undefined,
    status: normalizeQualityLossStatus(row.status),
    type: row.source,
    lossSource: row.source,
    workOrderNumber: row.workOrderNumber || '-',
    projectName: row.projectName || '-',
    partName: row.partName || '-',
    createdAt: row.indexedAt.toISOString(),
  };
}

export function normalizeLossSourceFilter(
  source: string | undefined,
): null | SingleQualityLossSource {
  if (!source) return null;
  const normalized = normalizeQualityLossSource(source);
  if (
    normalized === QL_CONSTANTS.SOURCE.MANUAL ||
    normalized === QL_CONSTANTS.SOURCE.INTERNAL ||
    normalized === QL_CONSTANTS.SOURCE.EXTERNAL ||
    normalized === QL_CONSTANTS.SOURCE.COMMISSIONING
  ) {
    return normalized;
  }
  return null;
}

export function mergeTrendData(
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
      if (p === 0 && granularity !== 'week') return;
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

export function formatTrendItem(
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
