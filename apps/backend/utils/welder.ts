import {
  buildWelderCreateDataCore,
  buildWelderUpdateDataCore,
  parseWelderListQuery as parseWelderListQueryCore,
} from '@qgs/domain';
import prisma from '~/utils/prisma';

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

export function parseWelderListQuery(query: Record<string, unknown>) {
  return parseWelderListQueryCore(query);
}

export function buildWelderCreateData(input: Record<string, unknown>) {
  const createData = buildWelderCreateDataCore(input);
  if (!createData) return null;
  return sanitizeWelderWriteData(createData);
}

export function buildWelderUpdateData(input: Record<string, unknown>) {
  return sanitizeWelderWriteData(buildWelderUpdateDataCore(input));
}
