import { buildRequestFingerprint } from '~/modules/idempotency';

/**
 * Stable fingerprint for the after-sales create request
 * (IDEMPOTENCY-KEY-001 / PHASE-2). Only the business-semantic fields that
 * decide the created after-sales record are included: work order, customer /
 * project context, issue description, quantities, costs, classifications and
 * responsibility. Volatile fields (serialNumber, photos upload order,
 * timestamps) are excluded; photos keep a stable sorted URL signature so a
 * changed photo set is detected as a payload change.
 */
export function buildAfterSalesCreateRequestFingerprint(
  body: Record<string, unknown>,
): string {
  const photoUrls = Array.isArray(body.photos)
    ? body.photos.map(String).filter(Boolean).sort()
    : [];
  return buildRequestFingerprint({
    customerName: text(body.customerName),
    defectCategoryId: text(body.defectCategoryId),
    defectSubcategoryId: text(body.defectSubcategoryId),
    issueDescription: text(body.issueDescription),
    laborTravelCost: number(body.laborTravelCost),
    location: text(body.location),
    materialCost: number(body.materialCost),
    occurDate: dateOnly(body.issueDate ?? body.occurDate),
    photos: photoUrls,
    productCategoryId: text(body.productCategoryId),
    productSubcategoryId: text(body.productSubcategoryId),
    productType: text(body.productType),
    productSubtype: text(body.productSubtype),
    projectName: text(body.projectName),
    quantity: number(body.quantity, 1),
    responsibleDept: text(body.responsibleDept),
    status: text(body.status),
    supplierBrandId: text(body.supplierBrandId),
    warrantyStatus: text(body.warrantyStatus),
    workOrderNumber: text(body.workOrderNumber),
  });
}

function text(value: unknown): null | string {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateOnly(value: unknown): null | string {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
