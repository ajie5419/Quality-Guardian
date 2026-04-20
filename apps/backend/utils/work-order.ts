export function parseWorkOrderNumber(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseRequiredWorkOrderNumber(value: unknown): null | string {
  const normalized = parseWorkOrderNumber(value);
  return normalized || null;
}

export function parseWorkOrderQuantity(
  value: unknown,
  defaultValue = 1,
): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(0, Math.trunc(parsed));
}

export function parseRequiredDate(value: unknown, fallback = new Date()): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function parseOptionalDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function addYearsToDate(date: Date, years = 1): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

function normalizeQueryText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parseWorkOrderListQuery(query: Record<string, unknown>) {
  const ids = normalizeQueryText(query.ids)
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const ignoreYearFilterRaw = query.ignoreYearFilter;
  const ignoreYearFilter =
    ignoreYearFilterRaw === true ||
    String(ignoreYearFilterRaw).toLowerCase() === 'true';

  return {
    page: parsePositiveInt(query.page, 1),
    pageSize: parsePositiveInt(query.pageSize, 20),
    granularity: normalizeQueryText(query.granularity),
    startDate: normalizeQueryText(query.startDate),
    endDate: normalizeQueryText(query.endDate),
    year: query.year ? Number(query.year) : undefined,
    productName: normalizeQueryText(query.productName),
    projectName: normalizeQueryText(query.projectName),
    status: normalizeQueryText(query.status),
    workOrderNumber: normalizeQueryText(query.workOrderNumber),
    ignoreYearFilter,
    keyword: normalizeQueryText(query.keyword),
    ids: ids && ids.length > 0 ? [...new Set(ids)] : undefined,
  };
}
