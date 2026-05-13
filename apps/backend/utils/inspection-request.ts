import type { PrismaClient } from '@prisma/client';

import { InspectionService } from '~/services/inspection.service';
import { resolveTaskDispatchCurrentUserId } from '~/utils/task-dispatch';

export const INSPECTION_REQUEST_STATUS = {
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
  DISPATCHED: 'DISPATCHED',
  INSPECTING: 'INSPECTING',
  SUBMITTED: 'SUBMITTED',
} as const;

const CHECK_RESULT_SET = new Set(['FAIL', 'NA', 'PASS']);
const REQUEST_STATUS_SET = new Set<string>(
  Object.values(INSPECTION_REQUEST_STATUS),
);

export function normalizeInspectionRequestText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeInspectionRequestCheckResult(
  value: unknown,
  fallback = 'PASS',
) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return CHECK_RESULT_SET.has(normalized) ? normalized : fallback;
}

export function normalizeInspectionRequestStatus(value: unknown) {
  const normalized = normalizeInspectionRequestText(value).toUpperCase();
  return REQUEST_STATUS_SET.has(normalized) ? normalized : '';
}

export function parseInspectionRequestPriority(value: unknown, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
}

export function parseInspectionRequestQuantity(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
}

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
  return {
    ...record,
    attachments: parseInspectionRequestAttachments(record.attachments),
    closeAttachments: parseInspectionRequestAttachments(
      record.closeAttachments,
    ),
    dispatcherName: record.dispatcher?.realName || record.dispatcher?.username,
    inspectorName: record.inspector?.realName || record.inspector?.username,
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
              checkItem: `${request.processName} ${request.partName}`,
              measuredValue: `${request.selfCheckResult}/${request.mutualCheckResult}`,
              remarks: request.requestInfo || '',
              result: result === 'FAIL' ? 'FAIL' : 'PASS',
              standardValue: 'PASS/PASS',
            },
          ],
    level1Component: request.partName,
    level2Component: request.partName,
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
