import {
  buildWelderCreateDataCore,
  buildWelderUpdateDataCore,
  parseWelderListQuery as parseWelderListQueryCore,
} from '@qgs/shared';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { resolveTeamIdForWrite } from '~/utils/team-resolver';

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

export async function buildWelderCreateData(input: Record<string, unknown>) {
  const createData = buildWelderCreateDataCore(input);
  if (!createData) return null;
  const teamId = await resolveTeamIdForWrite({
    explicitTeamId: String(input.teamId || '').trim() || undefined,
    team: String(createData.team || ''), // governance-allow-direct-name-id
  });
  return sanitizeWelderWriteData({
    ...createData,
    teamId,
    ...buildGovernedWriteFieldsForTable('welders', createData),
  });
}

export async function buildWelderUpdateData(input: Record<string, unknown>) {
  const updateData = buildWelderUpdateDataCore(input);
  const teamId = await resolveTeamIdForWrite({
    explicitTeamId: String(input.teamId || '').trim() || undefined,
    keepExistingWhenNameMissing: true,
    team: String(updateData.team || ''), // governance-allow-direct-name-id
  });
  return sanitizeWelderWriteData({
    ...updateData,
    teamId,
    ...buildGovernedWriteFieldsForTable('welders', updateData),
  });
}
