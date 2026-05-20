import type { PrismaClient } from '@prisma/client';

import {
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

  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
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
  const result = normalizeInspectionRequestText(body.result).toUpperCase();
  const inspectionItems = Array.isArray(body.inspectionItems)
    ? body.inspectionItems
    : [];
  const closeAttachments = normalizeInspectionRequestAttachments(
    body.attachments,
  );
  const componentName = normalizeInspectionRequestText(request.componentName);

  return InspectionService.create({
    category: 'PROCESS',
    documents:
      closeAttachments.length > 0 ? JSON.stringify(closeAttachments) : null,
    hasDocuments: closeAttachments.length > 0,
    inspectionDate:
      normalizeInspectionRequestText(body.inspectionDate) || new Date(),
    inspector:
      normalizeInspectionRequestText(body.inspector) ||
      normalizeInspectionRequestText(request.reporter),
    items:
      inspectionItems.length > 0
        ? inspectionItems
        : [
            {
              acceptanceCriteria: '报检前已完成自检和互检。',
              checkItem: `${request.processName} ${request.partName}${componentName ? ` ${componentName}` : ''}`,
              measuredValue: `${request.selfCheckResult}/${request.mutualCheckResult}`,
              remarks: request.requestInfo || '',
              result: result === 'FAIL' ? 'FAIL' : 'PASS',
              standardValue: 'PASS/PASS',
            },
          ],
    level1Component: request.partName,
    level2Component: componentName || undefined,
    processName: request.processName,
    projectName: request.work_order?.projectName || request.workOrderNumber,
    quantity: parseInspectionRequestQuantity(
      body.quantity,
      request.quantity || 1,
    ),
    qualifiedQuantity:
      typeof body.qualifiedQuantity === 'string' ||
      typeof body.qualifiedQuantity === 'number'
        ? body.qualifiedQuantity
        : undefined,
    remarks:
      normalizeInspectionRequestText(body.closeRemark) ||
      normalizeInspectionRequestText(request.requestInfo),
    result: result === 'FAIL' ? 'FAIL' : 'PASS',
    team: normalizeInspectionRequestText(request.team),
    unqualifiedQuantity:
      typeof body.unqualifiedQuantity === 'string' ||
      typeof body.unqualifiedQuantity === 'number'
        ? body.unqualifiedQuantity
        : undefined,
    workOrderNumber: request.workOrderNumber,
  });
}
