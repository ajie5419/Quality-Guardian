import { buildRequestFingerprint } from '~/modules/idempotency';

/**
 * Stable fingerprint for the inspection NC (issue) create request
 * (IDEMPOTENCY-KEY-001 / PHASE-2). Only business-semantic fields are
 * included; photos keep a sorted URL signature. The fingerprint is NOT an NC
 * dedup key: the same inspection legitimately allows multiple NCs, and a new
 * Idempotency-Key with the same payload creates a new NC by design. It only
 * detects "same key, different payload" (409 REUSED).
 */
export function buildInspectionIssueCreateRequestFingerprint(
  body: Record<string, unknown>,
): string {
  const photos = Array.isArray(body.photos)
    ? body.photos
        .map((photo) => photoUrl(photo))
        .filter(Boolean)
        .sort()
    : [];
  return buildRequestFingerprint({
    category: text(body.category),
    claim: text(body.claim),
    defectCategoryId: text(body.defectCategoryId),
    defectSubcategoryId: text(body.defectSubcategoryId),
    defectSubtype: text(body.defectSubtype),
    defectType: text(body.defectType),
    description: text(body.description),
    division: text(body.division),
    divisionId: text(body.divisionId),
    generateNcNumber: body.generateNcNumber === true,
    inspectionId: text(body.inspectionId),
    inspector: text(body.inspector),
    lossAmount: number(body.lossAmount),
    partName: text(body.partName),
    photos,
    processName: text(body.processName),
    projectName: text(body.projectName),
    quantity: number(body.quantity),
    reportDate: dateOnly(body.reportDate),
    reportedBy: text(body.reportedBy),
    responsibilityType: text(body.responsibilityType),
    responsibleDepartmentId: text(body.responsibleDepartmentId),
    responsibleWelder: text(body.responsibleWelder),
    rootCause: text(body.rootCause),
    severity: text(body.severity),
    solution: text(body.solution),
    sourceType: text(body.sourceType),
    status: text(body.status),
    supplierId: text(body.supplierId),
    workOrderNumber: text(body.workOrderNumber),
  });
}

function photoUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const photo = value as { fileId?: unknown; url?: unknown };
    return String(photo.url ?? photo.fileId ?? '').trim();
  }
  return '';
}

function text(value: unknown): null | string {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown): null | string {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
