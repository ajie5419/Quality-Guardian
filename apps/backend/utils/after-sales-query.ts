import { mapAfterSalesStatus } from '~/utils/after-sales-status';

export type AfterSalesDateMode = 'month' | 'week' | 'year';

function normalizeQueryText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText] = match;
  const year = Number.parseInt(yearText, 10);
  const monthIndex = Number.parseInt(monthText, 10) - 1;
  const day = Number.parseInt(dayText, 10);
  if ([year, monthIndex, day].some((value) => Number.isNaN(value))) {
    return undefined;
  }
  const date = new Date(year, monthIndex, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function parseAfterSalesDateMode(value: unknown): AfterSalesDateMode {
  return value === 'month' || value === 'week' ? value : 'year';
}

export function parseAfterSalesDateValue(value: unknown): string | undefined {
  return normalizeQueryText(value);
}

export function buildAfterSalesDateRange(params: {
  dateMode?: AfterSalesDateMode;
  dateValue?: string;
  year?: number;
}) {
  const dateMode = params.dateMode || 'year';

  if (dateMode === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(params.dateValue || '');
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const monthIndex = Number.parseInt(match[2], 10) - 1;
      if (!Number.isNaN(year) && !Number.isNaN(monthIndex)) {
        return {
          end: new Date(year, monthIndex + 1, 1),
          start: new Date(year, monthIndex, 1),
        };
      }
    }
  }

  if (dateMode === 'week') {
    const parsedDate = params.dateValue
      ? parseLocalDate(params.dateValue)
      : undefined;
    if (parsedDate) {
      const start = getWeekStart(parsedDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
  }

  const year =
    params.year && !Number.isNaN(params.year)
      ? params.year
      : new Date().getFullYear();
  return {
    end: new Date(year + 1, 0, 1),
    start: new Date(year, 0, 1),
  };
}

export function parseAfterSalesListQuery(query: Record<string, unknown>) {
  const yearRaw = normalizeQueryText(query.year);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

  return {
    dateMode: parseAfterSalesDateMode(query.dateMode),
    dateValue: parseAfterSalesDateValue(query.dateValue),
    year: Number.isNaN(year ?? Number.NaN) ? undefined : year,
    workOrderNumber: normalizeQueryText(query.workOrderNumber),
    projectName: normalizeQueryText(query.projectName),
    status: query.status
      ? mapAfterSalesStatus(normalizeQueryText(query.status))
      : undefined,
    supplierBrand: normalizeQueryText(query.supplierBrand),
  };
}
