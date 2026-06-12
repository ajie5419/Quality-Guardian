import type { Prisma } from '@prisma/client';

import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { buildKeywordOr, parsePagination } from '~/utils/query-helpers';

import { MetrologyImportService } from './metrology-import.service';
import {
  calculateRemainingDays,
  deriveMetrologyInspectionStatus,
  formatMetrologyDate,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  normalizeMetrologyBorrowStatus,
  startOfToday,
} from './metrology-status';
import { getMetrologyTemplateRows } from './metrology-template';

interface MetrologyListParams {
  inspectionStatus?: string;
  instrumentCode?: string;
  instrumentName?: string;
  keyword?: string;
  model?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  usingUnit?: string;
  validFrom?: string;
  validTo?: string;
}

interface MetrologyMutationPayload {
  inspectionStatus?: unknown;
  instrumentCode?: unknown;
  instrumentName?: unknown;
  model?: unknown;
  orderNo?: unknown;
  usingUnit?: unknown;
  validUntil?: unknown;
}

type MeasuringInstrumentWhereInput = Prisma.measuring_instrumentsWhereInput;
type MeasuringInstrumentOrderByInput =
  Prisma.measuring_instrumentsOrderByWithRelationInput;

const METROLOGY_SORT_FIELDS: Record<string, MeasuringInstrumentOrderByInput> = {
  instrumentCode: { instrumentCode: 'asc' },
  instrumentName: { instrumentName: 'asc' },
  inspectionStatusLabel: { inspectionStatus: 'asc' },
  model: { model: 'asc' },
  orderNo: { orderNo: 'asc' },
  remainingDays: { validUntil: 'asc' },
  usingUnit: { usingUnit: 'asc' },
  validUntil: { validUntil: 'asc' },
};

function parseOrderNo(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseExcelSerialDate(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const wholeDays = Math.floor(value);
  const utcDays = wholeDays - 25_569;
  const utcMillis = utcDays * 24 * 60 * 60 * 1000;
  const date = new Date(utcMillis);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseStructuredDateText(text: string) {
  const normalized = text.trim().replaceAll('年', '-').replaceAll('月', '-');
  const cleaned = normalized
    .replaceAll('日', '')
    .replaceAll('.', '-')
    .replaceAll('/', '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function parseDateValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { date: null as Date | null, error: null as null | string };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { date: null, error: '有效期格式无效' }
      : { date: value, error: null };
  }

  if (typeof value === 'number') {
    const parsedDate = parseExcelSerialDate(value);
    return parsedDate
      ? { date: parsedDate, error: null }
      : { date: null, error: '有效期格式无效' };
  }

  const text = String(value).trim();
  if (!text) {
    return { date: null, error: null };
  }

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const parsedDate = parseExcelSerialDate(Number(text));
    return parsedDate
      ? { date: parsedDate, error: null }
      : { date: null, error: '有效期格式无效' };
  }

  const parsed = parseStructuredDateText(text);
  if (!parsed) {
    return { date: null, error: '有效期格式无效' };
  }
  if (parsed.getFullYear() < 2000 || parsed.getFullYear() > 2100) {
    return { date: null, error: '有效期超出合理范围' };
  }
  return { date: parsed, error: null };
}

function buildListItem(item: {
  borrowStatus: string;
  createdAt: Date;
  id: string;
  inspectionStatus: string;
  instrumentCode: string;
  instrumentName: string;
  model: null | string;
  orderNo: null | number;
  sourceFileName: null | string;
  updatedAt: Date;
  usingUnit: null | string;
  validUntil: Date | null;
}) {
  const inspectionStatus = deriveMetrologyInspectionStatus(
    item.inspectionStatus,
    item.validUntil,
  );
  const borrowStatus = normalizeMetrologyBorrowStatus(item.borrowStatus);
  return {
    borrowStatus,
    borrowStatusLabel: getMetrologyBorrowStatusLabel(borrowStatus),
    createdAt: item.createdAt.toISOString(),
    id: item.id,
    inspectionStatus,
    inspectionStatusLabel: getMetrologyInspectionStatusLabel(inspectionStatus),
    instrumentCode: item.instrumentCode,
    instrumentName: item.instrumentName,
    model: item.model,
    orderNo: item.orderNo,
    remainingDays: calculateRemainingDays(item.validUntil),
    sourceFileName: item.sourceFileName,
    updatedAt: item.updatedAt.toISOString(),
    usingUnit: item.usingUnit,
    validUntil: formatMetrologyDate(item.validUntil),
  };
}

function buildQueryWhere(
  params: MetrologyListParams,
  options?: { ignoreInspectionStatus?: boolean },
) {
  const where = buildWhere(params);

  if (options?.ignoreInspectionStatus) {
    return where;
  }

  const inspectionStatusWhere = buildInspectionStatusWhere(
    params.inspectionStatus,
  );
  if (inspectionStatusWhere) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      inspectionStatusWhere,
    ];
  }

  return where;
}

function buildWhere(params: MetrologyListParams) {
  const where: MeasuringInstrumentWhereInput = {
    isDeleted: false,
  };

  if (params.instrumentName?.trim()) {
    where.instrumentName = { contains: params.instrumentName.trim() };
  }
  if (params.instrumentCode?.trim()) {
    where.instrumentCode = { contains: params.instrumentCode.trim() };
  }
  if (params.model?.trim()) {
    where.model = { contains: params.model.trim() };
  }
  if (params.usingUnit?.trim()) {
    where.usingUnit = { contains: params.usingUnit.trim() };
  }
  const keywordOr = buildKeywordOr(params.keyword, [
    'instrumentName',
    'instrumentCode',
    'model',
    'usingUnit',
  ] as const);
  if (keywordOr) Object.assign(where, keywordOr);
  if (params.validFrom || params.validTo) {
    where.validUntil = {
      ...(params.validFrom
        ? { gte: new Date(`${params.validFrom}T00:00:00.000Z`) }
        : {}),
      ...(params.validTo
        ? { lte: new Date(`${params.validTo}T23:59:59.999Z`) }
        : {}),
    };
  }

  return where;
}

function buildInspectionStatusWhere(
  rawStatus: string | undefined,
): MeasuringInstrumentWhereInput | null {
  if (!rawStatus) return null;
  const status = deriveMetrologyInspectionStatus(rawStatus, null);
  const today = startOfToday();
  const pendingUntil = new Date(today);
  pendingUntil.setDate(pendingUntil.getDate() + 30);
  const disabledWhere: MeasuringInstrumentWhereInput = {
    OR: [
      { inspectionStatus: { equals: 'DISABLED' } },
      { inspectionStatus: { equals: '停用' } },
      { inspectionStatus: { equals: '禁用' } },
    ],
  };
  const activeWhere: MeasuringInstrumentWhereInput = { NOT: disabledWhere };

  if (status === 'DISABLED') return disabledWhere;
  if (status === 'EXPIRED') {
    return { AND: [activeWhere, { validUntil: { lt: today } }] };
  }
  if (status === 'PENDING') {
    return {
      AND: [
        activeWhere,
        {
          OR: [
            { validUntil: null },
            { validUntil: { gte: today, lte: pendingUntil } },
          ],
        },
      ],
    };
  }
  return { AND: [activeWhere, { validUntil: { gt: pendingUntil } }] };
}

function buildMetrologyOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): MeasuringInstrumentOrderByInput[] {
  const configured = sortBy ? METROLOGY_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return [{ orderNo: 'asc' }, { createdAt: 'desc' }];
  const [field] = Object.keys(configured);
  return [{ [field]: sortOrder }, { createdAt: 'desc' }];
}

function normalizeMutationPayload(body: MetrologyMutationPayload) {
  const instrumentName = String(body.instrumentName || '').trim();
  const instrumentCode = String(body.instrumentCode || '').trim();
  const model = String(body.model || '').trim() || null;
  const usingUnit = String(body.usingUnit || '').trim() || null;
  const orderNo = parseOrderNo(body.orderNo);
  const parsedDate = parseDateValue(body.validUntil);
  const inspectionStatus = deriveMetrologyInspectionStatus(
    String(body.inspectionStatus || '').trim(),
    parsedDate.date,
  );

  return {
    inspectionStatus,
    instrumentCode,
    instrumentName,
    model,
    orderNo,
    parsedDate,
    usingUnit,
  };
}

export const MetrologyService = {
  async batchDelete(ids: string[], username?: string) {
    return prisma.measuring_instruments.updateMany({
      where: { id: { in: ids }, isDeleted: false },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: username || null,
      },
    });
  },

  async create(body: MetrologyMutationPayload, username?: string) {
    const data = this.buildMutationPayload(body);
    return prisma.measuring_instruments.create({
      data: {
        ...data,
        createdBy: username || null,
        updatedBy: username || null,
      },
    });
  },

  async deleteById(id: string, username?: string) {
    return prisma.measuring_instruments.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
        updatedBy: username || null,
      },
    });
  },

  async getList(params: MetrologyListParams) {
    const { skip, take } = parsePagination(params);
    const where = buildQueryWhere(params);

    const [items, total] = await Promise.all([
      prisma.measuring_instruments.findMany({
        where,
        orderBy: buildMetrologyOrderBy(params.sortBy, params.sortOrder),
        skip,
        take,
      }),
      prisma.measuring_instruments.count({ where }),
    ]);

    const list = items.map((item) => buildListItem(item));

    return {
      items: list,
      total,
    };
  },

  async getExportList(params: Omit<MetrologyListParams, 'page' | 'pageSize'>) {
    const where = buildQueryWhere(params);
    const items = await prisma.measuring_instruments.findMany({
      where,
      orderBy: buildMetrologyOrderBy(params.sortBy, params.sortOrder),
    });
    return {
      items: items.map((item) => buildListItem(item)),
      total: items.length,
    };
  },

  async getOverview(params: Omit<MetrologyListParams, 'page' | 'pageSize'>) {
    const where = buildQueryWhere(params, { ignoreInspectionStatus: true });
    // governance-allow-direct-canonical-read: overview endpoint aggregates status only; direct label projection stays for response compatibility.
    const items = await prisma.measuring_instruments.findMany({
      where,
      select: {
        borrowStatus: true,
        createdAt: true,
        id: true,
        inspectionStatus: true,
        instrumentCode: true,
        instrumentName: true,
        model: true,
        orderNo: true,
        sourceFileName: true,
        updatedAt: true,
        usingUnit: true,
        validUntil: true,
      },
      orderBy: [{ orderNo: 'asc' }, { updatedAt: 'desc' }],
    });

    const overview = {
      disabledCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      totalCount: 0,
      validCount: 0,
    };

    for (const item of items) {
      const status = deriveMetrologyInspectionStatus(
        item.inspectionStatus,
        item.validUntil,
      );

      overview.totalCount += 1;
      if (status === 'DISABLED') {
        overview.disabledCount += 1;
        continue;
      }
      if (status === 'EXPIRED') {
        overview.expiredCount += 1;
        continue;
      }
      if (status === 'PENDING') {
        overview.expiringSoonCount += 1;
        continue;
      }
      if (status === 'VALID') {
        overview.validCount += 1;
      }
    }

    return overview;
  },

  async importItems(items: unknown[], username?: string, fileName?: string) {
    return MetrologyImportService.importItems(items, username, fileName);
  },

  async updateById(
    id: string,
    body: MetrologyMutationPayload,
    username?: string,
  ) {
    const data = this.buildMutationPayload(body);
    return prisma.measuring_instruments.update({
      where: { id },
      data: { ...data, updatedBy: username || null },
    });
  },

  getTemplateRows() {
    return getMetrologyTemplateRows();
  },

  buildMutationPayload(body: MetrologyMutationPayload) {
    const normalized = normalizeMutationPayload(body);
    if (!normalized.instrumentName) {
      throw new Error('量具名称不能为空');
    }
    if (!normalized.instrumentCode) {
      throw new Error('编号不能为空');
    }
    if (normalized.parsedDate.error) {
      throw new Error(normalized.parsedDate.error);
    }

    return {
      inspectionStatus: normalized.inspectionStatus,
      instrumentCode: normalized.instrumentCode,
      ...buildGovernedWriteFieldsForTable('measuring_instruments', {
        instrumentName: normalized.instrumentName,
      }),
      instrumentName: normalized.instrumentName,
      model: normalized.model,
      orderNo: normalized.orderNo,
      usingUnit: normalized.usingUnit,
      validUntil: normalized.parsedDate.date,
    };
  },
};
