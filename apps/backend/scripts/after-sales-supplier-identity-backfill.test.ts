import { describe, expect, it } from 'vitest';

import { resolveAfterSalesSupplierIdentity } from './after-sales-supplier-identity-backfill';

describe('after-sales supplier identity backfill', () => {
  it('keeps an existing valid supplier ID', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: { id: 'supplier-1', name: 'Supplier A' },
        existingSupplierId: 'supplier-1',
        existingSupplierName: 'Supplier A',
        supplierByName: { id: 'supplier-2', name: 'Supplier B' },
      }),
    ).toEqual({ action: 'skip', reason: 'EXISTING_VALID_ID' });
  });

  it('does not overwrite an invalid existing ID by name', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: 'legacy-dictionary-id',
        existingSupplierName: 'Supplier A',
        supplierByName: { id: 'supplier-1', name: 'Supplier A' },
      }),
    ).toEqual({ action: 'unresolved', reason: 'INVALID_EXISTING_ID' });
  });

  it('backfills a missing ID from a unique exact supplier name', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: 'Supplier A',
        supplierByName: { id: 'supplier-1', name: 'Supplier A' },
      }),
    ).toEqual({
      action: 'update',
      candidate: { id: 'supplier-1', name: 'Supplier A' },
      reason: 'AFTER_SALES_SUPPLIER_NAME',
    });
  });

  it('audits a supplier name without a resolvable identity', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: 'Unknown Supplier',
        supplierByName: null,
      }),
    ).toEqual({ action: 'unresolved', reason: 'NO_IDENTITY_EVIDENCE' });
  });

  it('skips rows that do not reference a supplier', () => {
    expect(
      resolveAfterSalesSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: null,
        supplierByName: null,
      }),
    ).toEqual({
      action: 'skip',
      reason: 'NO_SUPPLIER_IDENTITY_REQUIRED',
    });
  });
});
