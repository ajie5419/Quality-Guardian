const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;
const INSPECTION_RECORD_TYPES = new Set([
  'ALL',
  'INCOMING',
  'PROCESS',
  'SHIPMENT',
]);

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function parseInspectionRecordListQuery(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const rawType = normalizeString(query.type)?.toUpperCase();
  const type =
    rawType && INSPECTION_RECORD_TYPES.has(rawType) ? rawType : 'INCOMING';

  const yearRaw = normalizeString(query.year);
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;

  return {
    keyword: normalizeString(query.keyword),
    page,
    pageSize,
    projectName: normalizeString(query.projectName),
    type,
    workOrderNumber: normalizeString(query.workOrderNumber),
    year: Number.isNaN(year) ? undefined : year,
  };
}
