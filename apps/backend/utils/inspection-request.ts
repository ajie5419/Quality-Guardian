import type { PrismaClient } from '@prisma/client';

import {
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
} from '@qgs/domain';
import { InspectionService } from '~/services/inspection.service';
import { resolveTaskDispatchCurrentUserId } from '~/utils/task-dispatch';

export {
  INSPECTION_REQUEST_STATUS,
  isInspectionRequestAssemblyProcess,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestStatus,
  normalizeInspectionRequestText,
  parseInspectionRequestPriority,
  parseInspectionRequestQuantity,
};

export function normalizeInspectionRequestAttachments(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const url = normalizeInspectionRequestText(source.url);
      if (!url) return null;

      const name =
        normalizeInspectionRequestText(source.name) ||
        normalizeInspectionRequestText(source.originalName) ||
        '报检单';
      return {
        fileId: normalizeInspectionRequestText(source.fileId) || undefined,
        name,
        size: Number(source.size || 0),
        type: normalizeInspectionRequestText(source.type),
        url,
      };
    })
    .filter(Boolean);
}

export function parseInspectionRequestAttachments(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mergeInspectionRequestAttachments(...sources: unknown[]) {
  const merged = [];
  const seen = new Set<string>();

  for (const source of sources) {
    for (const item of parseInspectionRequestAttachments(source)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const url = normalizeInspectionRequestText(record.url);
      if (!url) continue;
      const key = normalizeInspectionRequestText(record.fileId) || url;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return normalizeInspectionRequestAttachments(merged);
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

  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export function mapInspectionRequest(record: any) {
  const issue = Array.isArray(record.qualityRecords)
    ? record.qualityRecords.find((item: any) => !item?.isDeleted)
    : null;

  return {
    ...record,
    attachments: parseInspectionRequestAttachments(record.attachments),
    closeAttachments: parseInspectionRequestAttachments(
      record.closeAttachments,
    ),
    dispatcherName: record.dispatcher?.realName || record.dispatcher?.username,
    inspectionResult:
      record.inspectionResult || record.inspection?.result || 'PASS',
    inspectorName: record.inspector?.realName || record.inspector?.username,
    linkedIssueId: record.linkedIssueId || issue?.id || null,
    linkedIssueNo: record.linkedIssueNo || issue?.nonConformanceNumber || null,
    linkedIssueStatus: issue?.status || record.linkedIssueStatus || null,
    qualifiedQuantity:
      record.qualifiedQuantity ?? record.inspection?.qualifiedQuantity ?? null,
    unqualifiedQuantity:
      record.unqualifiedQuantity ??
      record.inspection?.unqualifiedQuantity ??
      issue?.quantity ??
      null,
  };
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
