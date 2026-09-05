import { buildRequestFingerprint } from '~/modules/idempotency';

import {
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';
import { normalizeInspectionRequestWorkOrderNumbers } from './inspection-request-work-orders';

/**
 * Stable fingerprint for the inspection-request create request
 * (IDEMPOTENCY-KEY-001 / PHASE-2). Only business-semantic fields that decide
 * the created request are included: work order identity, category, material
 * identity, process, quantity, responsibility and reporter. Volatile UI noise
 * (attachment upload order, client timestamps) is excluded; attachments keep a
 * stable sorted file signature so a changed attachment set is detected as a
 * payload change instead of a silent replay. The fingerprint only detects
 * "same key, different payload"; it never decides whether two different keys
 * are the same business event.
 */
export function buildInspectionRequestCreateRequestFingerprint(
  body: Record<string, unknown>,
): string {
  const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
  const stationSelection = normalizeStationSelection(body.stationSelection);
  return buildRequestFingerprint({
    attachments: normalizeAttachmentSignature(
      normalizeInspectionRequestAttachments(body.attachments),
    ),
    category: normalizeInspectionRequestText(body.category).toUpperCase(),
    componentName: normalizeInspectionRequestText(body.componentName),
    mutualCheckResult: normalizeInspectionRequestText(body.mutualCheckResult),
    partId: normalizeInspectionRequestText(body.partId),
    partName: normalizeInspectionRequestText(body.partName),
    processId: normalizeInspectionRequestText(body.processId),
    processName: normalizeInspectionRequestText(body.processName),
    quantity: parseInspectionRequestQuantity(body.quantity) ?? 0,
    reporter: normalizeInspectionRequestText(body.reporter),
    requestInfo: normalizeInspectionRequestText(body.requestInfo),
    requestedPartName: normalizeInspectionRequestText(body.requestedPartName),
    responsibilityType: normalizeInspectionRequestText(body.responsibilityType),
    responsibleDepartmentId: normalizeInspectionRequestText(
      body.responsibleDepartmentId,
    ),
    selfCheckResult: normalizeInspectionRequestText(body.selfCheckResult),
    stationSelection,
    supplierId: normalizeInspectionRequestText(body.supplierId),
    team: normalizeInspectionRequestText(body.team),
    teamId: normalizeInspectionRequestText(body.teamId),
    workOrderNumber: normalizeInspectionRequestText(body.workOrderNumber),
    workOrderNumbers,
  });
}

function normalizeStationSelection(
  value: unknown,
): null | { indexes: number[]; mode: string } {
  if (!value || typeof value !== 'object') return null;
  const selection = value as { indexes?: unknown; mode?: unknown };
  const indexes = Array.isArray(selection.indexes)
    ? selection.indexes
        .map(Number)
        .filter((item) => Number.isFinite(item))
        .sort((a, b) => a - b)
    : [];
  return {
    indexes,
    mode: String(selection.mode ?? ''),
  };
}

function normalizeAttachmentSignature(
  attachments: Array<Record<string, unknown>>,
): string[] {
  return attachments
    .map((attachment) => {
      const fileId = normalizeInspectionRequestText(attachment.fileId);
      return fileId || String(attachment.url ?? attachment.name ?? '');
    })
    .filter(Boolean)
    .sort();
}
