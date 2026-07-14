import type { Prisma } from '@prisma/client';
import type { InspectionIssueDateMode } from '@qgs/shared';

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
} from '@qgs/shared';
import { nanoid } from 'nanoid';
import { toQualityRecordStatus } from '~/modules/quality-loss/quality-loss-status';
import {
  parseResponsibleDepartments,
  serializeResponsibleDepartments,
} from '~/utils/department-multi';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import { resolveProcessIdForWrite } from '~/utils/process-resolver';

import { resolveIssueSupplierBody } from './inspection-issue-supplier';

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
  createdBy: null | string;
  userId: unknown;
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
  defectSubtype?: unknown;
  defectType?: unknown;
  description?: unknown;
  division?: unknown;
  ncNumber?: unknown;
  nonConformanceNumber?: unknown;
  partName?: unknown;
  projectName?: unknown;
  quantity?: unknown;
  rootCause?: unknown;
  processName?: unknown;
  responsibleDepartment?: unknown;
  responsibleDepartments?: unknown;
  responsibleWelder?: unknown;
  status?: unknown;
  supplierName?: unknown;
  workOrderNumber?: unknown;
}

export async function findInspectionIssueAccessRecord(id: string) {
  return prisma.quality_records.findUnique({
    where: { id, isDeleted: false },
    select: {
      createdBy: true,
      nonConformanceNumber: true,
      inspectionId: true,
    },
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
    createdBy?: string;
    id: string;
    inspection?: Awaited<ReturnType<typeof findInspectionForIssue>>;
    inspectorUsername?: string;
    serialNumber: number;
  },
) {
  const supplierBody = await resolveIssueSupplierBody(
    body,
    options.inspection,
    true,
  );
  const createData = buildInspectionIssueCreateDataCore({
    body: supplierBody,
    createdBy: options.createdBy,
    inspection: options.inspection,
    inspectorUsername: options.inspectorUsername,
    mapStatus: (value) => toQualityRecordStatus(value),
    serialNumber: options.serialNumber,
    uuid: options.id,
  }) as Prisma.quality_recordsCreateInput;
  return attachProcessIdToIssueCreateData(
    attachResponsibleDepartmentsToIssueCreateData(body, createData),
  );
}

function normalizeResponsibleDepartments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseResponsibleDepartments(value)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return [];
}

function attachResponsibleDepartmentsToIssueCreateData(
  body: Record<string, unknown>,
  createData: Prisma.quality_recordsCreateInput,
) {
  const departments = normalizeResponsibleDepartments(
    body.responsibleDepartments,
  );
  if (departments.length === 0) {
    return createData;
  }
  return {
    ...createData,
    responsibleDepartment: departments[0],
    responsibleDepartments: serializeResponsibleDepartments(departments),
  } as Prisma.quality_recordsCreateInput;
}

function attachResponsibleDepartmentsToIssueUpdateData(
  body: Record<string, unknown>,
  updateData: Prisma.quality_recordsUpdateInput,
) {
  if (body.responsibleDepartments === undefined) {
    return updateData;
  }
  const departments = normalizeResponsibleDepartments(
    body.responsibleDepartments,
  );
  return {
    ...updateData,
    responsibleDepartment:
      departments[0] ??
      normalizeOptionalInspectionIssueString(body.responsibleDepartment) ??
      '',
    responsibleDepartments: serializeResponsibleDepartments(departments),
  } as Prisma.quality_recordsUpdateInput;
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
  const {
    processId: _ignoredProcessId,
    supplierId: governedSupplierId,
    ...governedCanonicalIds
  } = governedCanonicalIdsRaw;
  const governedFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    createData as Record<string, unknown>,
  );
  const rawCreateData = createData as Record<string, unknown>;
  const supplierId = normalizeOptionalInspectionIssueString(
    governedSupplierId || rawCreateData.supplierId,
  );
  const { supplierId: _ignoredSupplierId, ...createDataWithoutSupplierId } =
    rawCreateData;
  const normalizedCreateData = {
    ...createDataWithoutSupplierId,
    ...governedFields,
    ...governedCanonicalIds,
    ...(supplierId ? { supplier: { connect: { id: supplierId } } } : {}),
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
  const { updateData: workOrderUpdateData, workOrderNumber } =
    normalizeWorkOrderRelationForIssueUpdate(updateData);
  const governedCanonicalIdsRaw = await buildGovernedCanonicalWritePairForTable(
    'quality_records',
    workOrderUpdateData as Record<string, unknown>,
  );
  const {
    processId: _ignoredProcessId,
    supplierId: governedSupplierId,
    ...governedCanonicalIds
  } = governedCanonicalIdsRaw;
  const governedFields = buildGovernedWriteFieldsForTable(
    'quality_records',
    workOrderUpdateData as Record<string, unknown>,
  );
  const rawUpdateData = workOrderUpdateData as Record<string, unknown>;
  const supplierId = normalizeOptionalInspectionIssueString(
    governedSupplierId || rawUpdateData.supplierId,
  );
  const { supplierId: _ignoredSupplierId, ...updateDataWithoutSupplierId } =
    rawUpdateData;
  const hasSupplierInput =
    body.supplierId !== undefined || body.supplierName !== undefined;
  const normalizedUpdateData = {
    ...updateDataWithoutSupplierId,
    ...governedFields,
    ...governedCanonicalIds,
    ...(hasSupplierInput
      ? {
          supplier: supplierId
            ? { connect: { id: supplierId } }
            : { disconnect: true },
        }
      : {}),
    ...(workOrderNumber === undefined
      ? {}
      : {
          work_orders: workOrderNumber
            ? {
                connect: {
                  workOrderNumber,
                },
              }
            : {
                disconnect: true,
              },
        }),
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

function normalizeWorkOrderRelationForIssueUpdate(
  updateData: Prisma.quality_recordsUpdateInput,
): {
  updateData: Prisma.quality_recordsUpdateInput;
  workOrderNumber?: string;
} {
  const rawWorkOrderNumber = (updateData as Record<string, unknown>)
    .workOrderNumber;
  if (rawWorkOrderNumber === undefined) {
    return { updateData };
  }

  const { workOrderNumber: _ignoredWorkOrderNumber, ...rest } =
    updateData as Record<string, unknown>;
  return {
    updateData: rest as Prisma.quality_recordsUpdateInput,
    workOrderNumber:
      normalizeOptionalInspectionIssueString(rawWorkOrderNumber) ?? '',
  };
}

function normalizeInspectorRelationForIssueUpdate(
  updateData: Prisma.quality_recordsUpdateInput,
): Prisma.quality_recordsUpdateInput {
  const raw = updateData as Record<string, unknown>;
  if (!('inspector' in raw)) {
    return updateData;
  }
  const { inspector, ...rest } = raw;
  const username = normalizeOptionalInspectionIssueString(inspector);
  return {
    ...rest,
    users_quality_records_inspectorTousers: username
      ? { connect: { username } }
      : { disconnect: true },
  } as Prisma.quality_recordsUpdateInput;
}

export async function buildInspectionIssueUpdateData(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
  inspection?: null | {
    category: string;
    supplierId?: null | string;
    teamId?: null | string;
  },
) {
  const supplierBody = await resolveIssueSupplierBody(body, inspection, false);
  const updateData = buildInspectionIssueUpdateDataCore(
    supplierBody,
    existingNcNumber,
    (value) => toQualityRecordStatus(value),
  ) as Prisma.quality_recordsUpdateInput;
  const withRelations = await attachProcessIdToIssueUpdateData(
    supplierBody,
    attachResponsibleDepartmentsToIssueUpdateData(supplierBody, updateData),
  );
  return normalizeInspectorRelationForIssueUpdate(withRelations);
}

export async function buildInspectionIssueUpsertPayload(
  item: InspectionIssueImportItem,
  serialNumber: number,
  options: { createdBy?: string } = {},
) {
  const payload = buildInspectionIssueUpsertPayloadCore(
    item,
    serialNumber,
    (value) => toQualityRecordStatus(value),
    createInspectionIssueId,
    options,
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
    { mode: 'legacy-import' },
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

export { type InspectionIssueDateMode } from '@qgs/shared';
