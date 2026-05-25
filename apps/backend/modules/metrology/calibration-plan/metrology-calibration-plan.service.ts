import prisma from '~/utils/prisma';

const STATUS_LABELS = {
  COMPLETED: '已完成',
  OVERDUE: '超期未完成',
  PLANNED: '已计划',
} as const;

type CalibrationPlanStatus = keyof typeof STATUS_LABELS;

interface CalibrationPlanListParams {
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

type CalibrationPlanOverviewParams = Omit<
  CalibrationPlanListParams,
  'page' | 'pageSize' | 'sortBy' | 'sortOrder'
>;

interface CalibrationPlanMutationPayload {
  actualDate?: unknown;
  instrumentId?: unknown;
  planDay?: unknown;
  planMonth?: unknown;
  planYear?: unknown;
  remark?: unknown;
}

interface CalibrationPlanImportRow {
  [key: string]: unknown;
}

function normalizeKey(value: unknown) {
  return String(value ?? '')
    .replaceAll(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function pickRowValue(row: CalibrationPlanImportRow, candidates: string[]) {
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

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function buildPlannedDate(year: number, month: number, day: number) {
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

function formatDate(value: Date | null | string | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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
  return buildPlannedDate(Number(yearText), Number(monthText), Number(dayText));
}

function parseDateValue(value: unknown) {
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

function parsePositiveInteger(
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

function deriveStatus(actualDate: Date | null, plannedDate: Date) {
  if (actualDate) {
    return 'COMPLETED' satisfies CalibrationPlanStatus;
  }

  if (plannedDate.getTime() < startOfToday().getTime()) {
    return 'OVERDUE' satisfies CalibrationPlanStatus;
  }

  return 'PLANNED' satisfies CalibrationPlanStatus;
}

function buildListItem(item: {
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
    'actualDate',
    'instrumentCode',
    'instrumentName',
    'model',
    'orderNo',
    'planDay',
    'planMonth',
    'plannedDate',
    'planYear',
    'statusLabel',
    'usingUnit',
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

function buildWhere(params: CalibrationPlanListParams) {
  const where: Record<string, unknown> = {
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
      ...(typeof where.instrument === 'object' ? where.instrument : {}),
      usingUnit: { contains: params.usingUnit.trim() },
    };
  }

  return where;
}

function buildOverviewWhere(params: CalibrationPlanOverviewParams) {
  const where = buildWhere(params);
  delete where.planMonth;
  return where;
}

function normalizeMutationPayload(body: CalibrationPlanMutationPayload) {
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

function getValidatedPlanParts(
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

function mapImportRow(row: CalibrationPlanImportRow) {
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

export const MetrologyCalibrationPlanService = {
  async getList(params: CalibrationPlanListParams) {
    const page = Math.max(Number(params.page || 1), 1);
    const pageSize = Math.min(
      Math.max(Number(params.pageSize || 20), 1),
      100_000,
    );
    const where = buildWhere(params);

    const rows = await prisma.metrology_calibration_plans.findMany({
      where,
      include: {
        instrument: {
          select: {
            id: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
          },
        },
      },
    });

    let items = rows.map((item) => buildListItem(item));
    if (params.status) {
      items = items.filter((item) => item.status === params.status);
    }
    items = sortList(items, params.sortBy, params.sortOrder);

    const total = items.length;
    const start = (page - 1) * pageSize;
    items = items.slice(start, start + pageSize);

    return { items, total };
  },

  async getAnnualGrid(
    params: Omit<CalibrationPlanListParams, 'page' | 'pageSize'>,
  ) {
    const where = buildWhere(params);
    const rows = await prisma.metrology_calibration_plans.findMany({
      where,
      include: {
        instrument: {
          select: {
            id: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
          },
        },
      },
      orderBy: [{ planMonth: 'asc' }, { planDay: 'asc' }],
    });

    const grouped = new Map<
      string,
      {
        instrumentCode: string;
        instrumentId: string;
        instrumentName: string;
        model: null | string;
        months: Record<string, Record<string, unknown>>;
        orderNo: null | number;
        usingUnit: null | string;
      }
    >();

    for (const row of rows) {
      const item = buildListItem(row);
      const key = row.instrument.id;
      const current = grouped.get(key) ?? {
        instrumentCode: row.instrument.instrumentCode,
        instrumentId: row.instrument.id,
        instrumentName: row.instrument.instrumentName,
        model: row.instrument.model,
        months: Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => [
            String(index + 1),
            {
              actualDate: null,
              id: null,
              planDay: null,
              plannedDate: null,
              status: undefined,
              statusLabel: null,
            },
          ]),
        ),
        orderNo: row.instrument.orderNo,
        usingUnit: row.instrument.usingUnit,
      };

      current.months[String(row.planMonth)] = {
        actualDate: item.actualDate,
        id: item.id,
        planDay: item.planDay,
        plannedDate: item.plannedDate,
        status: item.status,
        statusLabel: item.statusLabel,
      };
      grouped.set(key, current);
    }

    return [...grouped.values()].sort((left, right) =>
      compareValues(left.orderNo, right.orderNo, 'asc'),
    );
  },

  async getOverview(params: CalibrationPlanOverviewParams) {
    const where = buildOverviewWhere(params);
    const rows = await prisma.metrology_calibration_plans.findMany({
      where,
      include: {
        instrument: {
          select: {
            id: true,
            instrumentCode: true,
            instrumentName: true,
            model: true,
            orderNo: true,
            usingUnit: true,
          },
        },
      },
      orderBy: [{ plannedDate: 'asc' }],
    });

    const items = rows.map((item) => buildListItem(item));
    const selectedYear = params.year || new Date().getFullYear();
    const selectedMonth =
      params.month && params.month >= 1 && params.month <= 12
        ? params.month
        : new Date().getMonth() + 1;
    const today = startOfToday().getTime();
    const upcomingEnd = today + 7 * 24 * 60 * 60 * 1000;

    const summary = {
      completedCount: 0,
      currentMonthCount: 0,
      overdueCount: 0,
      totalCount: items.length,
      upcomingCount: 0,
    };
    const monthlyDistribution = Array.from({ length: 12 }, (_, index) => ({
      completed: 0,
      month: index + 1,
      overdue: 0,
      planned: 0,
      total: 0,
    }));

    for (const item of items) {
      const distribution = monthlyDistribution[item.planMonth - 1];
      if (distribution) {
        distribution.total += 1;
        if (item.status === 'COMPLETED') {
          distribution.completed += 1;
        } else if (item.status === 'OVERDUE') {
          distribution.overdue += 1;
        } else {
          distribution.planned += 1;
        }
      }

      if (item.status === 'COMPLETED') {
        summary.completedCount += 1;
      } else if (item.status === 'OVERDUE') {
        summary.overdueCount += 1;
      }

      if (item.planYear === selectedYear && item.planMonth === selectedMonth) {
        summary.currentMonthCount += 1;
      }

      const plannedDate = item.plannedDate
        ? new Date(`${item.plannedDate}T00:00:00`).getTime()
        : null;
      if (
        plannedDate !== null &&
        item.status !== 'COMPLETED' &&
        plannedDate >= today &&
        plannedDate <= upcomingEnd
      ) {
        summary.upcomingCount += 1;
      }
    }

    const upcomingItems = items
      .filter((item) => {
        if (!item.plannedDate || item.status === 'COMPLETED') {
          return false;
        }
        const plannedDate = new Date(`${item.plannedDate}T00:00:00`).getTime();
        return plannedDate >= today && plannedDate <= upcomingEnd;
      })
      .slice(0, 10);

    return {
      monthlyDistribution,
      summary,
      upcomingItems,
    };
  },

  async importItems(
    year: number,
    items: unknown[],
    username?: string,
    fileName?: string,
  ) {
    const rows = Array.isArray(items) ? items : [];
    const errors: Array<{ reason: string; row: number }> = [];
    let successCount = 0;

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2;
      const mapped = mapImportRow((rawRow || {}) as CalibrationPlanImportRow);
      if (!mapped) {
        continue;
      }

      if (!mapped.instrumentCode) {
        errors.push({ row: rowNumber, reason: '编号不能为空' });
        continue;
      }
      if (mapped.error) {
        errors.push({ row: rowNumber, reason: mapped.error });
        continue;
      }
      if (mapped.months.length === 0) {
        continue;
      }

      const instrument = await prisma.measuring_instruments.findFirst({
        where: {
          instrumentCode: mapped.instrumentCode,
          isDeleted: false,
        },
        select: { id: true },
      });

      if (!instrument) {
        errors.push({ row: rowNumber, reason: '编号未在台账中找到' });
        continue;
      }

      for (const monthPlan of mapped.months) {
        const plannedDate = buildPlannedDate(
          year,
          monthPlan.month,
          monthPlan.planDay,
        );

        if (!plannedDate) {
          errors.push({
            row: rowNumber,
            reason: `${monthPlan.month}月计划日期无效`,
          });
          continue;
        }

        await prisma.metrology_calibration_plans.upsert({
          where: {
            instrumentId_planYear_planMonth: {
              instrumentId: instrument.id,
              planMonth: monthPlan.month,
              planYear: year,
            },
          },
          update: {
            actualDate: null,
            isDeleted: false,
            planDay: monthPlan.planDay,
            plannedDate,
            remark: null,
            sourceFileName: fileName || null,
            status: deriveStatus(null, plannedDate),
            updatedBy: username || null,
          },
          create: {
            actualDate: null,
            createdBy: username || null,
            instrumentId: instrument.id,
            planDay: monthPlan.planDay,
            planMonth: monthPlan.month,
            plannedDate,
            planYear: year,
            remark: null,
            sourceFileName: fileName || null,
            status: deriveStatus(null, plannedDate),
            updatedBy: username || null,
          },
        });
        successCount += 1;
      }
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
        设备名称: '里氏硬度计',
        编号: '52105000004',
        '型号/规格': 'TIME5300',
        1: '',
        2: '',
        3: '',
        4: '',
        5: '',
        6: '',
        7: '',
        8: 20,
        9: '',
        10: '',
        11: '',
        12: '',
      },
    ];
  },

  buildMutationPayload(body: CalibrationPlanMutationPayload) {
    const normalized = normalizeMutationPayload(body);
    if (!normalized.instrumentId) {
      throw new Error('计量器具不能为空');
    }
    if (normalized.planYear.error) {
      throw new Error(normalized.planYear.error);
    }
    if (normalized.planMonth.error) {
      throw new Error(normalized.planMonth.error);
    }
    if (normalized.planDay.error) {
      throw new Error(normalized.planDay.error);
    }
    if (normalized.actualDate.error) {
      throw new Error(normalized.actualDate.error);
    }

    const { planDay, planMonth, planYear } = getValidatedPlanParts(normalized);
    const plannedDate = buildPlannedDate(planYear, planMonth, planDay);
    if (!plannedDate) {
      throw new Error('计划日期无效');
    }

    const status = deriveStatus(normalized.actualDate.date, plannedDate);

    return {
      actualDate: normalized.actualDate.date,
      instrumentId: normalized.instrumentId,
      planDay,
      planMonth,
      planYear,
      plannedDate,
      remark: normalized.remark,
      status,
    };
  },
};
