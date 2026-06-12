import type {
  QualityLossItem,
  QualityLossParams,
  QualityLossServiceTrendItem,
} from '@qgs/shared';
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

export type QualityLossQueryParams = PaginationParams & QualityLossParams;

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

export function formatManualLossItem(item: {
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

export function formatInternalRecordItem(item: {
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

export function formatExternalSalesItem(item: {
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

export function formatCommissioningIssueItem(item: {
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

export function sortByDateDesc(items: QualityLossItem[]): QualityLossItem[] {
  return items.sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
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
