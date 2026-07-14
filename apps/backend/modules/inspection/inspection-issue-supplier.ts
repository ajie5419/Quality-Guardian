import { SupplierIdentityService } from '~/modules/supplier-identity';

type LinkedInspectionIdentity =
  | null
  | undefined
  | {
      category: string;
      supplierId?: null | string;
      teamId?: null | string;
    };

function normalizeId(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

export async function resolveIssueSupplierBody(
  body: Record<string, unknown>,
  inspection: LinkedInspectionIdentity,
  force: boolean,
) {
  if (
    !force &&
    body.supplierId === undefined &&
    body.supplierName === undefined
  ) {
    return body;
  }
  const supplierIdentity =
    await SupplierIdentityService.resolveSupplierForInspection({
      category: inspection?.category || normalizeId(body.category) || '',
      supplierId: normalizeId(body.supplierId) || inspection?.supplierId,
      teamId: inspection?.teamId,
    });
  return supplierIdentity
    ? {
        ...body,
        supplierId: supplierIdentity.id,
        supplierName: supplierIdentity.name,
      }
    : body;
}
