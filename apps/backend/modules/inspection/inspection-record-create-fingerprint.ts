import { buildRequestFingerprint } from '~/modules/idempotency';

/**
 * Stable fingerprint for the inspection-record create request
 * (IDEMPOTENCY-KEY-001 / PHASE-2). Only business-semantic fields are
 * included: identity, category, quantities, result, inspector/date and a
 * normalized item signature. Attachments (documents / selfCheckDocuments),
 * remarks and client-side noise are excluded. The fingerprint only detects
 * "same key, different payload" (409 REUSED).
 */
export function buildInspectionRecordCreateRequestFingerprint(
  body: Record<string, unknown>,
): string {
  const items = Array.isArray(body.items)
    ? body.items.map((item) => {
        const row = item && typeof item === 'object' ? item : {};
        return {
          checkItem: text(row.checkItem),
          measuredValue: text(row.measuredValue),
          result: text(row.result),
          standardValue: text(row.standardValue),
          uom: text(row.uom),
        };
      })
    : [];
  const linkedIssue =
    body.linkedIssue && typeof body.linkedIssue === 'object'
      ? (body.linkedIssue as Record<string, unknown>)
      : {};
  return buildRequestFingerprint({
    category: text(body.category),
    incomingType: text(body.incomingType),
    inspectionDate: dateOnly(body.inspectionDate),
    inspector: text(body.inspector),
    items,
    level1Component: text(body.level1Component),
    level2Component: text(body.level2Component),
    linkedIssue: {
      enabled: linkedIssue.enabled === true,
      generateNcNumber: linkedIssue.generateNcNumber === true,
    },
    materialName: text(body.materialName),
    packingListArchived: text(body.packingListArchived),
    partId: text(body.partId),
    partName: text(body.partName),
    processId: text(body.processId),
    processName: text(body.processName),
    projectName: text(body.projectName),
    qualifiedQuantity: number(body.qualifiedQuantity),
    quantity: number(body.quantity),
    reportDate: dateOnly(body.reportDate),
    responsibilityType: text(body.responsibilityType),
    responsibleDepartment: text(body.responsibleDepartment),
    responsibleDepartmentId: text(body.responsibleDepartmentId),
    result: text(body.result),
    stationSelection: text(body.stationSelection),
    supplierId: text(body.supplierId),
    supplierName: text(body.supplierName),
    team: text(body.team),
    teamId: text(body.teamId),
    templateId: text(body.templateId),
    unqualifiedQuantity: number(body.unqualifiedQuantity),
    workOrderNumber: text(body.workOrderNumber),
  });
}

function text(value: unknown): null | string {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function number(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown): null | string {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
