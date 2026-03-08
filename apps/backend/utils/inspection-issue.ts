import { nanoid } from 'nanoid';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';

import prisma from './prisma';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export type InspectionIssueDateMode = 'month' | 'week' | 'year';

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

function getWeekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return start;
}

export function buildInspectionIssueDateRange(params: {
  dateMode?: InspectionIssueDateMode;
  dateValue?: string;
  year?: number;
}) {
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
    dateMode: parseInspectionIssueDateMode(query.dateMode),
    dateValue: parseInspectionIssueDateValue(query.dateValue),
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

function normalizeOptionalDate(value: unknown): Date | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
}

export function hasInspectionIssueAdminAccess(roles: unknown): boolean {
  if (!Array.isArray(roles)) {
    return false;
  }

  const normalizedRoles = roles
    .map((role) => normalizeOptionalString(role)?.toLowerCase())
    .filter(Boolean) as string[];

  return normalizedRoles.some(
    (role) => role === 'admin' || role === 'super' || role === 'super admin',
  );
}

export async function findInspectionIssueAccessRecord(id: string) {
  return prisma.quality_records.findUnique({
    where: { id },
    select: { inspector: true, nonConformanceNumber: true },
  });
}

export function hasInspectionIssueWriteAccess(params: {
  inspector: null | string;
  roles: unknown;
  username: unknown;
}): boolean {
  const isAdmin = hasInspectionIssueAdminAccess(params.roles);
  const isOwner = params.inspector === String(params.username ?? '');
  return isAdmin || isOwner;
}

export function buildInspectionIssueCreateData(
  body: Record<string, unknown>,
  options: {
    id: string;
    inspectorUsername?: string;
    serialNumber: number;
  },
) {
  const issueDate = normalizeOptionalDate(body.reportDate) ?? new Date();
  const workOrderNumber = normalizeOptionalString(body.workOrderNumber);

  return {
    id: options.id,
    serialNumber: options.serialNumber,
    date: issueDate,
    status: toQualityRecordStatus(normalizeOptionalString(body.status)),
    nonConformanceNumber: normalizeOptionalString(body.ncNumber) ?? null,
    work_orders: workOrderNumber
      ? {
          connect: {
            workOrderNumber,
          },
        }
      : undefined,
    projectName: normalizeOptionalString(body.projectName),
    processName: normalizeOptionalString(body.processName),
    partName: normalizeOptionalString(body.partName) ?? 'Unknown',
    division: normalizeOptionalString(body.division),
    defectType: normalizeOptionalString(body.defectType),
    defectSubtype: normalizeOptionalString(body.defectSubtype),
    rootCause: normalizeOptionalString(body.rootCause),
    solution: normalizeOptionalString(body.solution),
    description: normalizeOptionalString(body.description),
    quantity: normalizeOptionalNumber(body.quantity) ?? 1,
    lossAmount: normalizeOptionalNumber(body.lossAmount) ?? 0,
    responsibleDepartment:
      normalizeOptionalString(body.responsibleDepartment) ?? 'Unknown',
    supplierName: normalizeOptionalString(body.supplierName) ?? null,
    users_quality_records_inspectorTousers: options.inspectorUsername
      ? { connect: { username: options.inspectorUsername } }
      : undefined,
    isClaim: body.claim === 'Yes' || body.claim === true,
    issuePhoto:
      body.photos === undefined ? '[]' : JSON.stringify(body.photos ?? []),
    isDeleted: false,
    updatedAt: new Date(),
  };
}

export function buildInspectionIssueUpdateData(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.ncNumber !== undefined && body.ncNumber !== existingNcNumber) {
    updateData.nonConformanceNumber =
      normalizeOptionalString(body.ncNumber) ?? null;
  }

  const stringFields = [
    'workOrderNumber',
    'projectName',
    'processName',
    'partName',
    'inspector',
    'description',
    'responsibleDepartment',
    'supplierName',
    'rootCause',
    'solution',
    'defectType',
    'defectSubtype',
    'severity',
  ];
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updateData[field] = normalizeOptionalString(body[field]) ?? null;
    }
  }

  const quantity = normalizeOptionalNumber(body.quantity);
  if (quantity !== undefined) {
    updateData.quantity = quantity;
  }

  const lossAmount = normalizeOptionalNumber(body.lossAmount);
  if (lossAmount !== undefined) {
    updateData.lossAmount = lossAmount;
  }

  const reportDate = normalizeOptionalDate(body.reportDate);
  if (reportDate) {
    updateData.date = reportDate;
  }

  if (body.photos !== undefined) {
    updateData.issuePhoto = JSON.stringify(body.photos ?? []);
  }

  if (body.claim !== undefined) {
    updateData.isClaim = body.claim === 'Yes' || body.claim === true;
  }

  if (body.status !== undefined) {
    updateData.status = toQualityRecordStatus(
      normalizeOptionalString(body.status),
    );
  }

  return updateData;
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
