import type { PrismaClient } from '@prisma/client';

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
} from '@qgs/domain';
import { InspectionService } from '~/services/inspection.service';
import { resolveTaskDispatchCurrentUserId } from '~/utils/task-dispatch';

export { INSPECTION_REQUEST_STATUS, isInspectionRequestAssemblyProcess };

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
    closeRemark?: null | string;
    componentName?: null | string;
    mutualCheckResult: string;
    partName: string;
    processName: string;
    quantity?: number;
    reporter: string;
    requestInfo?: null | string;
    selfCheckResult: string;
    team?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  };
}) {
  return buildInspectionRecordPayloadCoreRule(input);
}

export async function generateInspectionRequestNo(
  client: PrismaClient,
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

export function mapInspectionRequest(record: any) {
  return mapInspectionRequestRecordRule(record);
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
    closeRemark?: null | string;
    componentName?: null | string;
    mutualCheckResult: string;
    partName: string;
    processName: string;
    quantity?: number;
    reporter: string;
    requestInfo?: null | string;
    selfCheckResult: string;
    team?: null | string;
    work_order?: null | { projectName?: null | string };
    workOrderNumber: string;
  },
  body: Record<string, unknown>,
) {
  return InspectionService.create(
    buildInspectionRecordPayloadCore({
      body,
      request,
    }),
  );
}
