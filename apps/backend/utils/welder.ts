import { nanoid } from 'nanoid';
import prisma from '~/utils/prisma';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

function parsePositiveInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

function normalizeString(value: unknown): string | undefined {
  const normalized = String(Array.isArray(value) ? value[0] : (value ?? ''))
    .trim()
    .replaceAll(/\s+/g, ' ');

  if (
    !normalized ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === '[object Object]'
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 12;
  }
  return Math.max(0, Math.min(12, Math.round(parsed)));
}

function normalizeDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  const text = normalizeString(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function normalizeEmploymentStatus(
  value: unknown,
): 'ON_DUTY' | 'RESIGNED' | undefined {
  const text = normalizeString(value)?.toLowerCase();
  if (!text) return undefined;
  if (
    text === 'on_duty' ||
    text === 'onduty' ||
    text === '在岗' ||
    text === '在职'
  ) {
    return 'ON_DUTY';
  }
  if (
    text === 'resigned' ||
    text === 'left' ||
    text === '离职' ||
    text === '已离职'
  ) {
    return 'RESIGNED';
  }
  return undefined;
}

function hasWelderField(fieldName: string) {
  const fields = (
    prisma as unknown as {
      _runtimeDataModel?: {
        models?: Record<string, { fields?: Array<{ name?: string }> }>;
      };
    }
  )._runtimeDataModel?.models?.welders?.fields;

  if (!Array.isArray(fields)) return false;
  return fields.some((field) => field?.name === fieldName);
}

export function hasWelderCodeField() {
  return hasWelderField('welderCode');
}

export function sanitizeWelderWriteData<T extends Record<string, unknown>>(
  data: T,
): T {
  const optionalFields = new Set([
    'employmentStatus',
    'examDate',
    'welderCode',
  ]);
  const sanitizedEntries = Object.entries(data).filter(([fieldName]) => {
    return !optionalFields.has(fieldName) || hasWelderField(fieldName);
  });

  return Object.fromEntries(sanitizedEntries) as T;
}

export function createWelderId() {
  return `WEL-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export function parseWelderListQuery(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(
    parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );

  const sortOrderRaw = normalizeString(query.sortOrder)?.toLowerCase();
  const sortOrder: 'asc' | 'desc' | undefined =
    sortOrderRaw === 'asc' || sortOrderRaw === 'desc'
      ? sortOrderRaw
      : undefined;

  return {
    keyword: normalizeString(query.keyword),
    page,
    pageSize,
    sortBy: normalizeString(query.sortBy),
    sortOrder,
    team: normalizeString(query.team),
    welderCode: normalizeString(query.welderCode),
    employmentStatus: normalizeEmploymentStatus(query.employmentStatus),
  };
}

export function buildWelderCreateData(input: Record<string, unknown>) {
  const name = normalizeString(input.name);
  const team = normalizeString(input.team);
  if (!name || !team) return null;

  return sanitizeWelderWriteData({
    id: createWelderId(),
    welderCode: normalizeString(input.welderCode) ?? null,
    name,
    team,
    examDate: normalizeDate(input.examDate) ?? null,
    examPassed: input.examPassed === true || input.examPassed === 'true',
    employmentStatus:
      normalizeEmploymentStatus(input.employmentStatus) ?? 'ON_DUTY',
    certificationNo: normalizeString(input.certificationNo) ?? null,
    score: normalizeScore(input.score),
    isDeleted: false,
  });
}

export function buildWelderUpdateData(input: Record<string, unknown>) {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updateData.name = normalizeString(input.name) ?? null;
  }
  if (input.welderCode !== undefined) {
    updateData.welderCode = normalizeString(input.welderCode) ?? null;
  }
  if (input.team !== undefined) {
    updateData.team = normalizeString(input.team) ?? null;
  }
  if (input.examDate !== undefined) {
    updateData.examDate = normalizeDate(input.examDate) ?? null;
  }
  if (input.examPassed !== undefined) {
    updateData.examPassed =
      input.examPassed === true || input.examPassed === 'true';
  }
  if (input.employmentStatus !== undefined) {
    updateData.employmentStatus =
      normalizeEmploymentStatus(input.employmentStatus) ?? 'ON_DUTY';
  }
  if (input.certificationNo !== undefined) {
    updateData.certificationNo = normalizeString(input.certificationNo) ?? null;
  }
  if (input.score !== undefined) {
    updateData.score = normalizeScore(input.score);
  }

  return sanitizeWelderWriteData(updateData);
}
