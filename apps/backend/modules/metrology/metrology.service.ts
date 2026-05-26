import type { Prisma } from '@prisma/client';

import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/governance/master-data/master-data-governance-write';
import prisma from '~/utils/prisma';

import {
  calculateRemainingDays,
  deriveMetrologyInspectionStatus,
  formatMetrologyDate,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  normalizeMetrologyBorrowStatus,
  startOfToday,
} from './metrology-status';

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

interface MetrologyImportRow {
  [key: string]: unknown;
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

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function pickRowValue(row: MetrologyImportRow, candidates: string[]) {
  const entries = Object.entries(row || {});
  for (const candidate of candidates) {
    const matched = entries.find(
      ([key]) => normalizeKey(key) === normalizeKey(candidate),
    );
    if (matched) {
      return matched[1];
    }
  }
  return undefined;
}

function parseOrderNo(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Excel stores date cells as serial numbers in many export files.
 * We must accept both human-readable strings and Excel serial values here,
 * otherwise batch import rejects valid rows as malformed dates.
 */
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

function mapImportRow(row: MetrologyImportRow) {
  const values = Object.values(row || {});
  const instrumentName = String(
    pickRowValue(row, ['量具名称', 'instrumentName']) ?? values[1] ?? '',
  ).trim();
  const instrumentCode = String(
    pickRowValue(row, ['编号', 'instrumentCode']) ?? values[2] ?? '',
  ).trim();
  const model = String(
    pickRowValue(row, ['型号', 'model']) ?? values[3] ?? '',
  ).trim();
  const usingUnit = String(
    pickRowValue(row, ['使用单位', 'usingUnit']) ?? values[4] ?? '',
  ).trim();
  const validUntilValue =
    pickRowValue(row, ['有效期', 'validUntil']) ?? values[5] ?? '';
  const inspectionStatusValue =
    pickRowValue(row, ['检验状态', 'inspectionStatus']) ?? values[6] ?? '';
  const orderNoValue =
    pickRowValue(row, ['序号', 'orderNo']) ?? values[0] ?? '';

  if (!instrumentName && !instrumentCode && !model && !usingUnit) {
    return null;
  }

  if (instrumentName === '量具名称' && instrumentCode === '编号') {
    return null;
  }

  const parsedDate = parseDateValue(validUntilValue);

  return {
    instrumentCode,
    instrumentName,
    inspectionStatusValue,
    model,
    orderNo: parseOrderNo(orderNoValue),
    parsedDate,
    usingUnit,
  };
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
  if (params.keyword?.trim()) {
    where.OR = [
      { instrumentName: { contains: params.keyword.trim() } },
      { instrumentCode: { contains: params.keyword.trim() } },
      { model: { contains: params.keyword.trim() } },
      { usingUnit: { contains: params.keyword.trim() } },
    ];
  }
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
    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize || 20), 1), 100);
    const where = buildQueryWhere(params);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.measuring_instruments.findMany({
        where,
        orderBy: buildMetrologyOrderBy(params.sortBy, params.sortOrder),
        skip,
        take: pageSize,
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
    const rows = Array.isArray(items) ? items : [];
    const seenCodes = new Set<string>();
    const errors: Array<{ reason: string; row: number }> = [];
    let successCount = 0;

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const mapped = mapImportRow((rawRow || {}) as MetrologyImportRow);
      if (!mapped) {
        continue;
      }

      if (!mapped.instrumentName) {
        errors.push({ row: rowNumber, reason: '量具名称不能为空' });
        continue;
      }
      if (!mapped.instrumentCode) {
        errors.push({ row: rowNumber, reason: '编号不能为空' });
        continue;
      }
      if (seenCodes.has(mapped.instrumentCode)) {
        errors.push({ row: rowNumber, reason: '同一文件中编号重复' });
        continue;
      }
      seenCodes.add(mapped.instrumentCode);

      if (mapped.parsedDate.error) {
        errors.push({ row: rowNumber, reason: mapped.parsedDate.error });
        continue;
      }

      const normalizedStatus = deriveMetrologyInspectionStatus(
        undefined,
        mapped.parsedDate.date,
      );
      const governedFields = buildGovernedWriteFieldsForTable(
        'measuring_instruments',
        {
          instrumentName: mapped.instrumentName,
        },
      );
      const governedInstrumentName =
        governedFields.instrumentName || mapped.instrumentName;
      const governedCanonicalIds =
        await buildGovernedCanonicalWritePairForTable('measuring_instruments', {
          instrumentName: governedInstrumentName,
        });

      await prisma.measuring_instruments.upsert({
        where: { instrumentCode: mapped.instrumentCode },
        update: {
          isDeleted: false,
          inspectionStatus: normalizedStatus,
          instrumentName: governedInstrumentName, // governance-allow-direct-name-id
          ...governedCanonicalIds,
          model: mapped.model || null,
          orderNo: mapped.orderNo,
          sourceFileName: fileName || null,
          updatedBy: username || null,
          usingUnit: mapped.usingUnit || null,
          validUntil: mapped.parsedDate.date,
        },
        create: {
          inspectionStatus: normalizedStatus,
          instrumentCode: mapped.instrumentCode,
          instrumentName: governedInstrumentName, // governance-allow-direct-name-id
          ...governedCanonicalIds,
          model: mapped.model || null,
          orderNo: mapped.orderNo,
          sourceFileName: fileName || null,
          createdBy: username || null,
          updatedBy: username || null,
          usingUnit: mapped.usingUnit || null,
          validUntil: mapped.parsedDate.date,
        },
      });
      successCount += 1;
    }

    return {
      errorCount: errors.length,
      errors,
      failedCount: errors.length,
      successCount,
      totalCount: rows.length,
    };
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
    return [
      {
        序号: 1,
        量具名称: '游标卡尺',
        编号: 'JL-001',
        型号: '0-150mm',
        使用单位: '结构BU1',
        有效期: '2026-12-31',
        检验状态: '在检',
      },
    ];
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
