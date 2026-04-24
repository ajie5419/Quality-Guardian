import {
  calculateRemainingDays,
  deriveMetrologyInspectionStatus,
  formatMetrologyDate,
  getMetrologyBorrowStatusLabel,
  getMetrologyInspectionStatusLabel,
  normalizeMetrologyBorrowStatus,
} from '~/utils/metrology-status';
import prisma from '~/utils/prisma';

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
    delete where.inspectionStatus;
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
  const where: Record<string, unknown> = {
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

function compareValues(
  left: null | number | string | undefined,
  right: null | number | string | undefined,
  direction: 'asc' | 'desc',
) {
  const leftValue = left ?? '';
  const rightValue = right ?? '';

  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return direction === 'asc'
      ? leftValue - rightValue
      : rightValue - leftValue;
  }

  const compareResult = String(leftValue).localeCompare(
    String(rightValue),
    'zh-CN',
    {
      numeric: true,
      sensitivity: 'base',
    },
  );
  return direction === 'asc' ? compareResult : -compareResult;
}

function sortList(
  items: ReturnType<typeof buildListItem>[],
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
) {
  if (!sortBy) {
    return items;
  }

  const sortableFields = new Set([
    'inspectionStatusLabel',
    'instrumentCode',
    'instrumentName',
    'model',
    'orderNo',
    'remainingDays',
    'usingUnit',
    'validUntil',
  ]);

  if (!sortableFields.has(sortBy)) {
    return items;
  }

  return [...items].sort((left, right) =>
    compareValues(
      left[sortBy as keyof typeof left] as null | number | string | undefined,
      right[sortBy as keyof typeof right] as null | number | string | undefined,
      sortOrder,
    ),
  );
}

export const MetrologyService = {
  async getList(params: MetrologyListParams) {
    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(params.pageSize || 20), 1),
      100_000,
    );
    const where = buildQueryWhere(params);

    const items = await prisma.measuring_instruments.findMany({ where });

    let list = items.map((item) => buildListItem(item));
    if (params.inspectionStatus) {
      const normalizedStatus = deriveMetrologyInspectionStatus(
        params.inspectionStatus,
        null,
      );
      list = list.filter((item) => item.inspectionStatus === normalizedStatus);
    }
    list = sortList(list, params.sortBy, params.sortOrder);

    const total = list.length;
    const start = (page - 1) * pageSize;
    list = list.slice(start, start + pageSize);

    return {
      items: list,
      total,
    };
  },

  async getExportList(params: Omit<MetrologyListParams, 'page' | 'pageSize'>) {
    return this.getList({
      ...params,
      page: 1,
      pageSize: 100_000,
    });
  },

  async getOverview(params: Omit<MetrologyListParams, 'page' | 'pageSize'>) {
    const where = buildQueryWhere(params, { ignoreInspectionStatus: true });
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

      await prisma.measuring_instruments.upsert({
        where: { instrumentCode: mapped.instrumentCode },
        update: {
          isDeleted: false,
          inspectionStatus: normalizedStatus,
          instrumentName: mapped.instrumentName,
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
          instrumentName: mapped.instrumentName,
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
      instrumentName: normalized.instrumentName,
      model: normalized.model,
      orderNo: normalized.orderNo,
      usingUnit: normalized.usingUnit,
      validUntil: normalized.parsedDate.date,
    };
  },
};
