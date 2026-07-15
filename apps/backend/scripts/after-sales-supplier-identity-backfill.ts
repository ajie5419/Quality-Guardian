import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';

export type AfterSalesSupplierIdentityResolution =
  | { action: 'skip'; reason: 'EXISTING_VALID_ID' }
  | {
      action: 'unresolved';
      reason: 'INVALID_EXISTING_ID' | 'NO_IDENTITY_EVIDENCE';
    }
  | {
      action: 'update';
      candidate: SupplierIdentity;
      reason: 'AFTER_SALES_SUPPLIER_NAME';
    };

export function resolveAfterSalesSupplierIdentity(input: {
  existingSupplier: null | SupplierIdentity;
  existingSupplierId: null | string;
  supplierByName: null | SupplierIdentity;
}): AfterSalesSupplierIdentityResolution {
  if (input.existingSupplier) {
    return { action: 'skip', reason: 'EXISTING_VALID_ID' };
  }
  if (input.existingSupplierId) {
    return { action: 'unresolved', reason: 'INVALID_EXISTING_ID' };
  }
  if (input.supplierByName) {
    return {
      action: 'update',
      candidate: input.supplierByName,
      reason: 'AFTER_SALES_SUPPLIER_NAME',
    };
  }
  return { action: 'unresolved', reason: 'NO_IDENTITY_EVIDENCE' };
}
