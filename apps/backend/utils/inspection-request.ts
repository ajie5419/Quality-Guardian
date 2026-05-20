import type { PrismaClient } from '@prisma/client';

import {
  buildInspectionRecordPayloadCore,
  buildInspectionRequestNo,
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequestRecord,
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  parseInspectionRequestAttachments,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
} from '@qgs/domain';
import { InspectionService } from '~/services/inspection.service';
import { resolveTaskDispatchCurrentUserId } from '~/utils/task-dispatch';

export {
  buildInspectionRecordPayloadCore,
  buildInspectionRequestNo,
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequestRecord,
  mergeInspectionRequestAttachments,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  parseInspectionRequestAttachments,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
};

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
  return mapInspectionRequestRecord(record);
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
