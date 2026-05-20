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

export function buildInspectionIssueCreateData(
  body: Record<string, unknown>,
  options: {
    id: string;
    inspection?: Awaited<ReturnType<typeof findInspectionForIssue>>;
    inspectorUsername?: string;
    serialNumber: number;
  },
) {
  return buildInspectionIssueCreateDataCore({
    body,
    inspection: options.inspection,
    inspectorUsername: options.inspectorUsername,
    mapStatus: (value) => toQualityRecordStatus(value),
    serialNumber: options.serialNumber,
    uuid: options.id,
  }) as Prisma.quality_recordsCreateInput;
}

export function buildInspectionIssueUpdateData(
  body: Record<string, unknown>,
  existingNcNumber: null | string,
) {
  return buildInspectionIssueUpdateDataCore(body, existingNcNumber, (value) =>
    toQualityRecordStatus(value),
  ) as Prisma.quality_recordsUpdateInput;
}

export function buildInspectionIssueUpsertPayload(
  item: InspectionIssueImportItem,
  serialNumber: number,
) {
  return buildInspectionIssueUpsertPayloadCore(
    item,
    serialNumber,
    (value) => toQualityRecordStatus(value),
    createInspectionIssueId,
  ) as null | Prisma.quality_recordsUpsertArgs;
}

export { type InspectionIssueDateMode } from '@qgs/domain';
