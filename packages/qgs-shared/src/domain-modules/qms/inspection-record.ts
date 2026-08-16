/**
 * Permission codes for inspection records (backend-enforced via
 * authorizeWrite; menu buttons mirror these codes).
 */
export const INSPECTION_RECORD_PERMISSION_CODES = {
  CREATE: 'QMS:Inspection:Records:Create',
  DELETE: 'QMS:Inspection:Records:Delete',
  EDIT: 'QMS:Inspection:Records:Edit',
  IMPORT: 'QMS:Inspection:Records:Import',
  LIST: 'QMS:Inspection:Records:List',
  VIEW: 'QMS:Inspection:Records:View',
} as const;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
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
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');
  return normalized || undefined;
}

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;

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

function parseDateBoundary(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  return normalized && parseLocalDate(normalized) ? normalized : undefined;
}

export function buildInspectionRecordDateRange(params: {
  endDate?: string;
  startDate?: string;
}) {
  const start = params.startDate ? parseLocalDate(params.startDate) : undefined;
  const end = params.endDate ? parseLocalDate(params.endDate) : undefined;
  if (!start || !end || start > end) return undefined;

  const exclusiveEnd = new Date(end);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  return { end: exclusiveEnd, start };
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
    componentName: normalizeString(query.componentName),
    endDate: parseDateBoundary(query.endDate),
    hasDocuments: parseOptionalBoolean(query.hasDocuments),
    inspector: normalizeString(query.inspector),
    keyword: normalizeString(query.keyword),
    level1Component: normalizeString(query.level1Component),
    materialName: normalizeString(query.materialName),
    page,
    pageSize,
    processName: normalizeString(query.processName),
    projectName: normalizeString(query.projectName),
    sourceInspectionId: normalizeString(query.sourceInspectionId),
    startDate: parseDateBoundary(query.startDate),
    supplierName: normalizeString(query.supplierName),
    team: normalizeString(query.team),
    type,
    workOrderNumber: normalizeString(query.workOrderNumber),
    year: Number.isNaN(year) ? undefined : year,
  };
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const normalized = normalizeString(value)?.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}
