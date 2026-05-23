import type { Prisma } from '@prisma/client';
import type { InspectionIssueDateMode } from '@qgs/domain';

import {
  buildInspectionIssueCreateDataCore,
  buildInspectionIssueDateRange as buildInspectionIssueDateRangeRule,
  buildInspectionIssueUpdateDataCore,
  buildInspectionIssueUpsertPayloadCore,
  createInspectionIssueId as createInspectionIssueIdRule,
  hasInspectionIssueAdminAccess as domainHasInspectionIssueAdminAccess,
  hasInspectionIssueWriteAccess as domainHasInspectionIssueWriteAccess,
  normalizeOptionalInspectionIssueDate as normalizeOptionalInspectionIssueDateRule,
  normalizeOptionalInspectionIssueNumber as normalizeOptionalInspectionIssueNumberRule,
  normalizeOptionalInspectionIssueString as normalizeOptionalInspectionIssueStringRule,
  parseInspectionIssueDateMode as parseInspectionIssueDateModeRule,
  parseInspectionIssueDateValue as parseInspectionIssueDateValueRule,
  parseInspectionIssueListQuery as parseInspectionIssueListQueryRule,
  parseOptionalIssueYear as parseOptionalIssueYearRule,
} from '@qgs/domain';
import { nanoid } from 'nanoid';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import { resolveProcessIdForWrite } from '~/utils/process-resolver';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';

import prisma from './prisma';

export function buildInspectionIssueDateRange(params: {
  dateMode?: InspectionIssueDateMode;
  dateValue?: string;
  year?: number;
}) {
  return buildInspectionIssueDateRangeRule(params);
}

export function normalizeOptionalInspectionIssueDate(value: unknown) {
  return normalizeOptionalInspectionIssueDateRule(value);
}

export function normalizeOptionalInspectionIssueNumber(value: unknown) {
  return normalizeOptionalInspectionIssueNumberRule(value);
}

export function normalizeOptionalInspectionIssueString(value: unknown) {
  return normalizeOptionalInspectionIssueStringRule(value);
}

export function parseInspectionIssueDateMode(value: unknown) {
  return parseInspectionIssueDateModeRule(value);
}

export function parseInspectionIssueDateValue(value: unknown) {
  return parseInspectionIssueDateValueRule(value);
}

export function parseInspectionIssueListQuery(query: Record<string, unknown>) {
  return parseInspectionIssueListQueryRule(query);
}

export function parseOptionalIssueYear(value: unknown) {
  return parseOptionalIssueYearRule(value);
}

export function hasInspectionIssueAdminAccess(roles: unknown): boolean {
  return domainHasInspectionIssueAdminAccess(roles);
}

export function hasInspectionIssueWriteAccess(params: {
  inspector: null | string;
  roles: unknown;
  username: unknown;
}): boolean {
  return domainHasInspectionIssueWriteAccess(params);
}

export function createInspectionIssueId(): string {
  return createInspectionIssueIdRule(new Date(), nanoid(8));
}

export async function getNextInspectionIssueSerialNumber(): Promise<number> {
  const result = await prisma.quality_records.aggregate({
    _max: { serialNumber: true },
  });
  return (result._max.serialNumber || 0) + 1;
}

interface InspectionIssueImportItem {
  description?: unknown;
  division?: unknown;
  ncNumber?: unknown;
  nonConformanceNumber?: unknown;
  partName?: unknown;
  projectName?: unknown;
  quantity?: unknown;
  processName?: unknown;
  responsibleDepartment?: unknown;
  responsibleWelder?: unknown;
  status?: unknown;
  workOrderNumber?: unknown;
}

export async function findInspectionIssueAccessRecord(id: string) {
  return prisma.quality_records.findUnique({
    where: { id },
    select: { inspector: true, nonConformanceNumber: true, inspectionId: true },
  });
}

export async function findInspectionForIssue(inspectionId?: string) {
  const normalizedId = normalizeOptionalInspectionIssueString(inspectionId);
  if (!normalizedId) {
    return null;
  }

  return prisma.inspections.findUnique({
    where: { id: normalizedId },
    include: {
      work_order: {
        select: {
          division: true,
        },
      },
    },
  });
}

export async function buildInspectionIssueCreateData(
  body: Record<string, unknown>,
  options: {
    id: string;
    inspection?: Awaited<ReturnType<typeof findInspectionForIssue>>;
    inspectorUsername?: string;
    serialNumber: number;
  },
) {
  const createData = buildInspectionIssueCreateDataCore({
    body,
    inspection: options.inspection,
    inspectorUsername: options.inspectorUsername,
    mapStatus: (value) => toQualityRecordStatus(value),
    serialNumber: options.serialNumber,
    uuid: options.id,
  }) as Prisma.quality_recordsCreateInput;
  return attachProcessIdToIssueCreateData(createData);
}

async function attachProcessIdToIssueCreateData(
  createData: Prisma.quality_recordsCreateInput,
) {
  const processName = normalizeOptionalInspectionIssueString(
    createData.processName,
  );
  const processId = await resolveProcessIdForWrite({ processName });
  const governedCanonicalIdsRaw = await buildGovernedCanonicalWritePairForTable(
    'quality_records',
    createData as Record<string, unknown>,
  );
  const { processId: _ignoredProcessId, ...governedCanonicalIds } =
    governedCanonicalIdsRaw;
  const governedFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    createData as Record<string, unknown>,
  );
  const normalizedCreateData = {
    ...createData,
    ...governedFields,
    ...governedCanonicalIds,
  } as Prisma.quality_recordsCreateInput;
  if (!processId) {
    return normalizedCreateData;
  }
  return {
    ...normalizedCreateData,
    process: {
      connect: {
        id: processId,
      },
    },
  } as Prisma.quality_recordsCreateInput;
}

async function attachProcessIdToIssueUpdateData(
  body: Record<string, unknown>,
  updateData: Prisma.quality_recordsUpdateInput,
) {
  const governedCanonicalIdsRaw = await buildGovernedCanonicalWritePairForTable(
    'quality_records',
    updateData as Record<string, unknown>,
  );
  const { processId: _ignoredProcessId, ...governedCanonicalIds } =
    governedCanonicalIdsRaw;
  const governedFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    updateData as Record<string, unknown>,
  );
  const normalizedUpdateData = {
    ...updateData,
    ...governedFields,
    ...governedCanonicalIds,
  } as Prisma.quality_recordsUpdateInput;
  if (body.processName === undefined) {
    return normalizedUpdateData;
  }
  const processName = normalizeOptionalInspectionIssueString(body.processName);
  const processId = await resolveProcessIdForWrite({ processName });
  if (!processId) {
    return {
      ...normalizedUpdateData,
      process: {
        disconnect: true,
      },
    } as Prisma.quality_recordsUpdateInput;
  }
  return {
    ...normalizedUpdateData,
    process: {
      connect: {
        id: processId,
      },
    },
  } as Prisma.quality_recordsUpdateInput;
}

export async function buildInspectionIssueUpdateData(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
) {
  const updateData = buildInspectionIssueUpdateDataCore(
    body,
    existingNcNumber,
    (value) => toQualityRecordStatus(value),
  ) as Prisma.quality_recordsUpdateInput;
  return attachProcessIdToIssueUpdateData(body, updateData);
}

export async function buildInspectionIssueUpsertPayload(
  item: InspectionIssueImportItem,
  serialNumber: number,
) {
  const payload = buildInspectionIssueUpsertPayloadCore(
    item,
    serialNumber,
    (value) => toQualityRecordStatus(value),
    createInspectionIssueId,
  ) as null | Prisma.quality_recordsUpsertArgs;
  if (!payload) {
    return null;
  }

  const processName = normalizeOptionalInspectionIssueString(
    (item as { processName?: unknown }).processName,
  );
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'quality_records',
    item as Record<string, unknown>,
  );
  const governedFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    item as Record<string, unknown>,
  );
  if (!processName) {
    return {
      ...payload,
      create: {
        ...payload.create,
        ...governedFields,
        ...governedCanonicalIds,
      },
      update: {
        ...payload.update,
        ...governedFields,
        ...governedCanonicalIds,
      },
    } as Prisma.quality_recordsUpsertArgs;
  }
  const processId = await resolveProcessIdForWrite({ processName });
  const processWrite = processId
    ? {
        connect: {
          id: processId,
        },
      }
    : { disconnect: true };
  return {
    ...payload,
    create: {
      ...payload.create,
      ...governedFields,
      ...governedCanonicalIds,
      processName,
      ...(processId
        ? {
            process: processWrite,
          }
        : {}),
    },
    update: {
      ...payload.update,
      ...governedFields,
      ...governedCanonicalIds,
      processName,
      process: processWrite,
    },
  } as Prisma.quality_recordsUpsertArgs;
}

export { type InspectionIssueDateMode } from '@qgs/domain';
