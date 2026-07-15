import type { Prisma, PrismaClient } from '@prisma/client';
import type { InspectionRequestRecordLike } from '@qgs/shared';

import {
  buildInspectionRecordPayloadCore as buildInspectionRecordPayloadCoreRule,
  buildInspectionRequestNo as buildInspectionRequestNoRule,
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequestRecord as mapInspectionRequestRecordRule,
  mergeInspectionRequestAttachments as mergeInspectionRequestAttachmentsRule,
  normalizeInspectionRequestAttachments as normalizeInspectionRequestAttachmentsRule,
  normalizeInspectionRequestCheckResult as normalizeInspectionRequestCheckResultRule,
  normalizeInspectionRequestStatus as normalizeInspectionRequestStatusRule,
  normalizeInspectionRequestText as normalizeInspectionRequestTextRule,
  parseInspectionRequestAttachments as parseInspectionRequestAttachmentsRule,
  parseInspectionRequestPriority as parseInspectionRequestPriorityRule,
  parseInspectionRequestQuantity as parseInspectionRequestQuantityRule,
  serializeInspectionStationSelection as serializeInspectionStationSelectionRule,
} from '@qgs/shared';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { resolveTaskDispatchCurrentUserId } from '~/modules/task-dispatch/task-dispatch-rules';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

export const INCOMING_INSPECTION_PROCESS_NAME = '进货检验';

export { INSPECTION_REQUEST_STATUS, isInspectionRequestAssemblyProcess };

export function isIncomingInspectionRequestProcess(value: unknown) {
  return (
    normalizeInspectionRequestText(value) === INCOMING_INSPECTION_PROCESS_NAME
  );
}

export function normalizeInspectionRequestText(value: unknown): string {
  return normalizeInspectionRequestTextRule(value);
}

export function normalizeInspectionRequestCheckResult(
  value: unknown,
  fallback = 'PASS',
) {
  return normalizeInspectionRequestCheckResultRule(value, fallback);
}

export function normalizeInspectionRequestStatus(value: unknown) {
  return normalizeInspectionRequestStatusRule(value);
}

export function parseInspectionRequestPriority(value: unknown, fallback = 3) {
  return parseInspectionRequestPriorityRule(value, fallback);
}

export function parseInspectionRequestQuantity(value: unknown, fallback = 1) {
  return parseInspectionRequestQuantityRule(value, fallback);
}

export function serializeInspectionStationSelection(
  value: unknown,
  quantity?: unknown,
) {
  return serializeInspectionStationSelectionRule(value, quantity);
}

export function normalizeInspectionRequestAttachments(value: unknown) {
  return normalizeInspectionRequestAttachmentsRule(value);
}

export function parseInspectionRequestAttachments(value: unknown) {
  return parseInspectionRequestAttachmentsRule(value);
}

export function mergeInspectionRequestAttachments(...sources: unknown[]) {
  return mergeInspectionRequestAttachmentsRule(...sources);
}

export function mapInspectionRequestRecord<T extends Record<string, unknown>>(
  record: T,
) {
  return mapInspectionRequestRecordRule(record);
}

export function buildInspectionRequestNo(params: {
  count: number;
  now?: Date;
}) {
  return buildInspectionRequestNoRule(params);
}

export function buildInspectionRecordPayloadCore(input: {
  body: Record<string, unknown>;
  request: {
    attachments?: unknown;
    closeRemark?: null | string;
    componentName?: null | string;
    mutualCheckResult: string;
    partName: string;
    processName: string;
    quantity?: number;
    reporter: string;
    requestInfo?: null | string;
    selfCheckResult: string;
    stationSelection?: null | string;
    supplierId?: null | string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
}) {
  const payload = buildInspectionRecordPayloadCoreRule(input);
  if (!isIncomingInspectionRequestProcess(input.request.processName)) {
    return payload;
  }
  if (payload.category === 'INCOMING') {
    return payload;
  }

  const requestInfo = parseIncomingInspectionRequestInfo(
    input.request.requestInfo,
  );
  return {
    category: 'INCOMING' as const,
    documents: payload.documents,
    hasDocuments: payload.hasDocuments,
    hasSelfCheckDocuments: payload.hasSelfCheckDocuments,
    inspectionDate: payload.inspectionDate,
    inspector: payload.inspector,
    incomingType: requestInfo.incomingType || INCOMING_INSPECTION_PROCESS_NAME,
    items: Array.isArray(input.body.inspectionItems)
      ? input.body.inspectionItems
      : [
          {
            acceptanceCriteria: '来料外观、数量和资料符合进货检验要求。',
            checkItem: `${INCOMING_INSPECTION_PROCESS_NAME} ${input.request.partName}`,
            measuredValue: payload.result === 'FAIL' ? 'FAIL' : 'PASS',
            remarks: requestInfo.notes,
            result: payload.result,
            standardValue: 'PASS',
          },
        ],
    materialName: input.request.partName,
    projectName: payload.projectName,
    qualifiedQuantity: payload.qualifiedQuantity,
    quantity: payload.quantity,
    remarks: requestInfo.notes || payload.remarks,
    result: payload.result,
    selfCheckDocuments: payload.selfCheckDocuments,
    stationSelection: payload.stationSelection,
    supplierName: normalizeInspectionRequestText(input.request.team),
    unqualifiedQuantity: payload.unqualifiedQuantity,
    workOrderNumber: payload.workOrderNumber,
  };
}

function parseIncomingInspectionRequestInfo(value?: null | string) {
  const raw = normalizeInspectionRequestText(value);
  if (!raw) return { incomingType: '', notes: '' };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      incomingType: normalizeInspectionRequestText(parsed.incomingType),
      notes: normalizeInspectionRequestText(parsed.notes),
    };
  } catch {
    return { incomingType: '', notes: raw };
  }
}

export async function generateInspectionRequestNo(
  client: Pick<PrismaClient, 'qms_inspection_requests'>,
  now = new Date(),
) {
  const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
  const prefix = `IR-${datePart}`;
  const count = await client.qms_inspection_requests.count({
    where: {
      requestNo: { startsWith: prefix },
    },
  });

  return buildInspectionRequestNo({ count, now });
}

type InspectionRequestMappableRecord = InspectionRequestRecordLike & {
  process?: null | { name?: null | string };
  processName?: null | string;
};

export function mapInspectionRequest<T extends InspectionRequestMappableRecord>(
  record: T,
) {
  return mapInspectionRequestRecordRule({
    ...record,
    processName: resolveCanonicalProcessName(record) || '',
  });
}

export async function resolveInspectionRequestCurrentUserId(
  userinfo: {
    id?: unknown;
    userId?: unknown;
    username?: unknown;
  },
  prisma: PrismaClient,
) {
  return resolveTaskDispatchCurrentUserId(userinfo, prisma);
}

export async function buildInspectionRecordFromRequest(
  request: {
    attachments?: unknown;
    closeRemark?: null | string;
    componentName?: null | string;
    mutualCheckResult: string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    quantity?: number;
    reporter: string;
    requestInfo?: null | string;
    selfCheckResult: string;
    stationSelection?: null | string;
    supplierId?: null | string;
    team?: null | string;
    teamId?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  },
  body: Record<string, unknown>,
  override?: { projectName?: null | string; workOrderNumber?: string },
  client?: Prisma.TransactionClient,
) {
  return InspectionService.create(
    buildInspectionRecordPayloadCore({
      body,
      request: {
        ...request,
        processName:
          resolveCanonicalProcessName(request) ||
          normalizeInspectionRequestText(request.processName),
        work_order:
          override?.projectName === undefined
            ? request.work_order
            : { projectName: override.projectName },
        workOrderNumber: override?.workOrderNumber || request.workOrderNumber,
      },
    }),
    client,
  );
}
