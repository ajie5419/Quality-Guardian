import { describe, expect, it } from 'vitest';

import { resolveAfterSalesSupplierIdentity } from './after-sales-supplier-identity-backfill';

describe('after-sales supplier identity backfill', () => {
  it('keeps an existing valid supplier ID', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: { id: 'supplier-1', name: 'Supplier A' },
        existingSupplierId: 'supplier-1',
        supplierByName: { id: 'supplier-2', name: 'Supplier B' },
      }),
    ).toEqual({ action: 'skip', reason: 'EXISTING_VALID_ID' });
  });

  it('does not overwrite an invalid existing ID by name', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: 'legacy-dictionary-id',
        supplierByName: { id: 'supplier-1', name: 'Supplier A' },
      }),
    ).toEqual({ action: 'unresolved', reason: 'INVALID_EXISTING_ID' });
  });

  it('backfills a missing ID from a unique exact supplier name', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        supplierByName: { id: 'supplier-1', name: 'Supplier A' },
      }),
    ).toEqual({
      action: 'update',
      candidate: { id: 'supplier-1', name: 'Supplier A' },
      reason: 'AFTER_SALES_SUPPLIER_NAME',
    });
  });

  it('audits rows without a resolvable identity', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        supplierByName: null,
      }),
    ).toEqual({ action: 'unresolved', reason: 'NO_IDENTITY_EVIDENCE' });
  });
});
