const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export type InspectionIssueDateMode = 'month' | 'week' | 'year';

function getQueryValue(query: Record<string, unknown>, key: string) {
  return query[key] ?? query[`${key}[]`];
}

function normalizeString(value: unknown): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');
  return normalized || undefined;
}

function parsePositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return undefined;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

export function parseInspectionIssueDateBoundary(
  value: unknown,
): string | undefined {
  const normalized = normalizeString(value);
  return normalized && parseLocalDate(normalized) ? normalized : undefined;
}

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

function parseMultiString(value: unknown): string | string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter(Boolean) as string[];
    if (normalized.length === 0) return undefined;
    return normalized.length === 1 ? normalized[0] : normalized;
  }

  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  if (!normalized.includes(',')) return normalized;

  const parts = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts;
}

export function parseOptionalIssueYear(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function parseInspectionIssueDateMode(
  value: unknown,
): InspectionIssueDateMode {
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === 'month' || normalized === 'week') {
    return normalized;
  }
  return 'year';
}

export function parseInspectionIssueDateValue(value: unknown) {
  return normalizeString(value);
}

export function buildInspectionIssueDateRange(params: {
  dateMode?: InspectionIssueDateMode;
  dateValue?: string;
  endDate?: string;
  startDate?: string;
  year?: number;
}) {
  const customStart = params.startDate
    ? parseLocalDate(params.startDate)
    : undefined;
  const customEnd = params.endDate ? parseLocalDate(params.endDate) : undefined;
  if (customStart && customEnd && customStart <= customEnd) {
    const exclusiveEnd = new Date(customEnd);
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
    return { end: exclusiveEnd, start: customStart };
  }

  const dateMode = params.dateMode || 'year';

  if (dateMode === 'month' && params.dateValue) {
    const match = /^(\d{4})-(\d{2})$/.exec(params.dateValue.trim());
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (
        Number.isInteger(year) &&
        Number.isInteger(monthIndex) &&
        monthIndex >= 0 &&
        monthIndex <= 11
      ) {
        const start = new Date(year, monthIndex, 1);
        const end = new Date(year, monthIndex + 1, 1);
        return { end, start };
      }
    }
  }

  if (dateMode === 'week' && params.dateValue) {
    const baseDate = parseLocalDate(params.dateValue);
    if (baseDate) {
      const start = getWeekStart(baseDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { end, start };
    }
  }

  const currentYear = params.year || new Date().getFullYear();
  const start = new Date(currentYear, 0, 1);
  const end = new Date(currentYear + 1, 0, 1);
  return { end, start };
}

export function parseInspectionIssueListQuery(query: Record<string, unknown>) {
  const page = parsePositiveInt(getQueryValue(query, 'page'), DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(getQueryValue(query, 'pageSize'), DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const yearValue = getQueryValue(query, 'year');
  const year = yearValue
    ? Number.parseInt(String(yearValue), 10) || undefined
    : undefined;

  const sortOrderRaw = normalizeString(
    getQueryValue(query, 'sortOrder'),
  )?.toLowerCase();
  let sortOrder: 'asc' | 'desc' | undefined;
  if (sortOrderRaw === 'asc' || sortOrderRaw === 'desc') {
    sortOrder = sortOrderRaw;
  }

  return {
    dateMode: parseInspectionIssueDateMode(getQueryValue(query, 'dateMode')),
    dateValue: parseInspectionIssueDateValue(getQueryValue(query, 'dateValue')),
    defectCategoryId: parseMultiString(
      getQueryValue(query, 'defectCategoryId'),
    ),
    endDate: parseInspectionIssueDateBoundary(getQueryValue(query, 'endDate')),
    page,
    pageSize,
    processName: normalizeString(getQueryValue(query, 'processName')),
    projectName: normalizeString(getQueryValue(query, 'projectName')),
    responsibleDepartment: parseMultiString(
      getQueryValue(query, 'responsibleDepartment'),
    ),
    responsibleWelder: normalizeString(
      getQueryValue(query, 'responsibleWelder'),
    ),
    severity: parseMultiString(getQueryValue(query, 'severity')),
    sortBy: normalizeString(getQueryValue(query, 'sortBy')),
    sortOrder,
    startDate: parseInspectionIssueDateBoundary(
      getQueryValue(query, 'startDate'),
    ),
    status: parseMultiString(getQueryValue(query, 'status')),
    supplierName: normalizeString(getQueryValue(query, 'supplierName')),
    workOrderNumber: normalizeString(getQueryValue(query, 'workOrderNumber')),
    year,
  };
}
