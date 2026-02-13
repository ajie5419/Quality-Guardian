import { nanoid } from 'nanoid';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';

import prisma from './prisma';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

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

export function createInspectionIssueId(): string {
  return `ISS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}

export async function getNextInspectionIssueSerialNumber(): Promise<number> {
  const result = await prisma.quality_records.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

export function parseInspectionIssueListQuery(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const year = query.year
    ? Number.parseInt(String(query.year), 10) || undefined
    : undefined;

  const sortOrderRaw = normalizeString(query.sortOrder)?.toLowerCase();
  let sortOrder: 'asc' | 'desc' | undefined;
  if (sortOrderRaw === 'asc' || sortOrderRaw === 'desc') {
    sortOrder = sortOrderRaw;
  }

  return {
    defectType: parseMultiString(query.defectType),
    page,
    pageSize,
    processName: normalizeString(query.processName),
    projectName: normalizeString(query.projectName),
    severity: parseMultiString(query.severity),
    sortBy: normalizeString(query.sortBy),
    sortOrder,
    status: parseMultiString(query.status),
    supplierName: normalizeString(query.supplierName),
    workOrderNumber: normalizeString(query.workOrderNumber),
    year,
  };
}

interface InspectionIssueImportItem {
  description?: unknown;
  division?: unknown;
  ncNumber?: unknown;
  nonConformanceNumber?: unknown;
  partName?: unknown;
  projectName?: unknown;
  quantity?: unknown;
  responsibleDepartment?: unknown;
  status?: unknown;
  workOrderNumber?: unknown;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

export function buildInspectionIssueUpsertPayload(
  item: InspectionIssueImportItem,
  serialNumber: number,
) {
  const ncNumber =
    normalizeOptionalString(item.nonConformanceNumber) ??
    normalizeOptionalString(item.ncNumber);
  if (!ncNumber) {
    return null;
  }

  const quantity = normalizeOptionalNumber(item.quantity);
  const status = toQualityRecordStatus(normalizeOptionalString(item.status));

  return {
    create: {
      id: createInspectionIssueId(),
      serialNumber,
      date: new Date(),
      status,
      partName: normalizeOptionalString(item.partName) ?? '未知零件',
      description: normalizeOptionalString(item.description) ?? '',
      quantity: quantity ?? 0,
      projectName: normalizeOptionalString(item.projectName) ?? '',
      division: normalizeOptionalString(item.division) ?? '',
      responsibleDepartment:
        normalizeOptionalString(item.responsibleDepartment) ?? '质量部',
      nonConformanceNumber: ncNumber,
      workOrderNumber: normalizeOptionalString(item.workOrderNumber) ?? null,
    },
    update: {
      partName: normalizeOptionalString(item.partName),
      description: normalizeOptionalString(item.description),
      quantity,
      projectName: normalizeOptionalString(item.projectName),
      responsibleDepartment: normalizeOptionalString(
        item.responsibleDepartment,
      ),
      status,
    },
    where: { nonConformanceNumber: ncNumber },
  };
}
