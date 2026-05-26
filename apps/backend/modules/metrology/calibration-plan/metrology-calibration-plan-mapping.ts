import type { Prisma } from '@prisma/client';

export const STATUS_LABELS = {
  COMPLETED: '已完成',
  OVERDUE: '超期未完成',
  PLANNED: '已计划',
} as const;

export type CalibrationPlanStatus = keyof typeof STATUS_LABELS;

export interface CalibrationPlanListParams {
  keyword?: string;
  month?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: string;
  usingUnit?: string;
  year?: number;
}

export type CalibrationPlanOverviewParams = Omit<
  CalibrationPlanListParams,
  'page' | 'pageSize' | 'sortBy' | 'sortOrder'
>;

export interface CalibrationPlanMutationPayload {
  actualDate?: unknown;
  instrumentId?: unknown;
  planDay?: unknown;
  planMonth?: unknown;
  planYear?: unknown;
  remark?: unknown;
}

export interface CalibrationPlanImportRow {
  [key: string]: unknown;
}

export type CalibrationPlanWhereInput =
  Prisma.metrology_calibration_plansWhereInput;
export type CalibrationPlanOrderByInput =
  Prisma.metrology_calibration_plansOrderByWithRelationInput;

export const CALIBRATION_PLAN_SORT_FIELDS: Record<
  string,
  CalibrationPlanOrderByInput
> = {
  actualDate: { actualDate: 'asc' },
  instrumentCode: { instrument: { instrumentCode: 'asc' } },
  instrumentName: { instrument: { instrumentName: 'asc' } },
  model: { instrument: { model: 'asc' } },
  orderNo: { instrument: { orderNo: 'asc' } },
  planDay: { planDay: 'asc' },
  planMonth: { planMonth: 'asc' },
  plannedDate: { plannedDate: 'asc' },
  planYear: { planYear: 'asc' },
  statusLabel: { status: 'asc' },
  usingUnit: { instrument: { usingUnit: 'asc' } },
};

export function buildCalibrationPlanOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'asc',
): CalibrationPlanOrderByInput[] {
  const configured = sortBy ? CALIBRATION_PLAN_SORT_FIELDS[sortBy] : undefined;
  if (!configured) return [{ plannedDate: 'asc' }, { createdAt: 'desc' }];
  const [field] = Object.keys(configured);
  if (field === 'instrument') {
    const instrumentOrder = configured.instrument || {};
    const [instrumentField] = Object.keys(instrumentOrder);
    return [
      { instrument: { [instrumentField]: sortOrder } },
      { createdAt: 'desc' },
    ];
  }
  return [{ [field]: sortOrder }, { createdAt: 'desc' }];
}

export function normalizeKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function pickRowValue(
  row: CalibrationPlanImportRow,
  candidates: string[],
) {
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

export function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function buildPlannedDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDate(value: Date | null | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseStructuredDateText(text: string) {
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
  return buildPlannedDate(Number(yearText), Number(monthText), Number(dayText));
}

export function parseDateValue(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { date: null as Date | null, error: null as null | string };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { date: null, error: '实际完成日期格式无效' }
      : { date: value, error: null };
  }

  const text = String(value).trim();
  if (!text) {
    return { date: null, error: null };
  }

  const parsed = parseStructuredDateText(text);
  if (!parsed) {
    return { date: null, error: '实际完成日期格式无效' };
  }

  return { date: parsed, error: null };
}

export function parsePositiveInteger(
  value: unknown,
  fieldName: string,
  options?: { max?: number; min?: number },
) {
  const text = String(value ?? '').trim();
  if (!text) {
    return { value: null as null | number, error: `${fieldName}不能为空` };
  }

  const parsed = Number(text);
  if (!Number.isInteger(parsed)) {
    return { value: null, error: `${fieldName}必须是整数` };
  }

  if (options?.min !== undefined && parsed < options.min) {
    return { value: null, error: `${fieldName}超出范围` };
  }

  if (options?.max !== undefined && parsed > options.max) {
    return { value: null, error: `${fieldName}超出范围` };
  }

  return { value: parsed, error: null as null | string };
}

export function deriveStatus(actualDate: Date | null, plannedDate: Date) {
  if (actualDate) {
    return 'COMPLETED' satisfies CalibrationPlanStatus;
  }

  if (plannedDate.getTime() < startOfToday().getTime()) {
    return 'OVERDUE' satisfies CalibrationPlanStatus;
  }

  return 'PLANNED' satisfies CalibrationPlanStatus;
}

export function buildListItem(item: {
  actualDate: Date | null;
  createdAt: Date;
  id: string;
  instrument: {
    id: string;
    instrumentCode: string;
    instrumentName: string;
    model: null | string;
    orderNo: null | number;
    usingUnit: null | string;
  };
  planDay: number;
  planMonth: number;
  plannedDate: Date;
  planYear: number;
  remark: null | string;
  sourceFileName: null | string;
  updatedAt: Date;
}) {
  const status = deriveStatus(item.actualDate, item.plannedDate);

  return {
    actualDate: formatDate(item.actualDate),
    createdAt: item.createdAt.toISOString(),
    id: item.id,
    instrumentCode: item.instrument.instrumentCode,
    instrumentId: item.instrument.id,
    instrumentName: item.instrument.instrumentName,
    model: item.instrument.model,
    orderNo: item.instrument.orderNo,
    planDay: item.planDay,
    planMonth: item.planMonth,
    planYear: item.planYear,
    plannedDate: formatDate(item.plannedDate),
    remark: item.remark,
    sourceFileName: item.sourceFileName,
    status,
    statusLabel: STATUS_LABELS[status],
    updatedAt: item.updatedAt.toISOString(),
    usingUnit: item.instrument.usingUnit,
  };
}

export function compareValues(
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

export function buildWhere(params: CalibrationPlanListParams) {
  const where: CalibrationPlanWhereInput = {
    isDeleted: false,
  };

  if (params.year) {
    where.planYear = params.year;
  }

  if (params.month) {
    where.planMonth = params.month;
  }

  if (params.keyword?.trim()) {
    where.instrument = {
      isDeleted: false,
      OR: [
        { instrumentName: { contains: params.keyword.trim() } },
        { instrumentCode: { contains: params.keyword.trim() } },
        { model: { contains: params.keyword.trim() } },
      ],
    };
  } else if (params.usingUnit?.trim()) {
    where.instrument = {
      isDeleted: false,
      usingUnit: { contains: params.usingUnit.trim() },
    };
  } else {
    where.instrument = {
      isDeleted: false,
    };
  }

  if (params.usingUnit?.trim()) {
    where.instrument = {
      ...(typeof where.instrument === 'object'
        ? where.instrument
        : { isDeleted: false }),
      usingUnit: { contains: params.usingUnit.trim() },
    };
  }

  const statusWhere = buildCalibrationStatusWhere(params.status);
  if (statusWhere) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), statusWhere];
  }

  return where;
}

export function buildCalibrationStatusWhere(
  status: string | undefined,
): CalibrationPlanWhereInput | null {
  if (!status) return null;
  if (status === 'COMPLETED') return { actualDate: { not: null } };
  if (status === 'OVERDUE') {
    return { actualDate: null, plannedDate: { lt: startOfToday() } };
  }
  if (status === 'PLANNED') {
    return { actualDate: null, plannedDate: { gte: startOfToday() } };
  }
  return null;
}

export function buildOverviewWhere(params: CalibrationPlanOverviewParams) {
  const where = buildWhere(params);
  delete where.planMonth;
  return where;
}

export function normalizeMutationPayload(body: CalibrationPlanMutationPayload) {
  const instrumentId = String(body.instrumentId || '').trim();
  const planYear = parsePositiveInteger(body.planYear, '计划年份', {
    min: 2000,
    max: 2100,
  });
  const planMonth = parsePositiveInteger(body.planMonth, '计划月份', {
    min: 1,
    max: 12,
  });
  const planDay = parsePositiveInteger(body.planDay, '计划日期', {
    min: 1,
    max: 31,
  });
  const actualDate = parseDateValue(body.actualDate);
  const remark = String(body.remark || '').trim() || null;

  return {
    actualDate,
    instrumentId,
    planDay,
    planMonth,
    planYear,
    remark,
  };
}

export function getValidatedPlanParts(
  normalized: ReturnType<typeof normalizeMutationPayload>,
) {
  if (
    normalized.planDay.value === null ||
    normalized.planMonth.value === null ||
    normalized.planYear.value === null
  ) {
    throw new Error('计划日期无效');
  }

  return {
    planDay: normalized.planDay.value,
    planMonth: normalized.planMonth.value,
    planYear: normalized.planYear.value,
  };
}

export function mapImportRow(row: CalibrationPlanImportRow) {
  const values = Object.values(row || {});
  const instrumentCode = String(
    pickRowValue(row, ['编号', 'instrumentCode']) ?? values[2] ?? '',
  ).trim();
  const instrumentName = String(
    pickRowValue(row, ['设备名称', '量具名称', 'instrumentName']) ??
      values[1] ??
      '',
  ).trim();
  const months: Array<{ month: number; planDay: number }> = [];

  for (let month = 1; month <= 12; month += 1) {
    const cellValue = pickRowValue(row, [
      String(month),
      `${month}月`,
      `month${month}`,
    ]);
    const text = String(cellValue ?? '').trim();
    if (!text) {
      continue;
    }
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return {
        error: `${month}月计划日期无效`,
        instrumentCode,
        instrumentName,
        months: [],
      };
    }
    months.push({ month, planDay: parsed });
  }

  if (!instrumentCode && !instrumentName) {
    return null;
  }

  if (instrumentCode === '编号') {
    return null;
  }

  return {
    error: null as null | string,
    instrumentCode,
    instrumentName,
    months,
  };
}
