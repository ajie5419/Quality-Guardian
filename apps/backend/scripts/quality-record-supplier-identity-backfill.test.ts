import { describe, expect, it } from 'vitest';

import {
  buildUniqueIdentityMap,
  parseBackfillOptions,
  resolveQualityRecordSupplierIdentity,
} from './quality-record-supplier-identity-backfill';

const supplierA = { id: 'supplier-a', name: 'Supplier A' };
const supplierB = { id: 'supplier-b', name: 'Supplier B' };

describe('quality record supplier identity backfill', () => {
  it('defaults to a bounded dry run', () => {
    expect(parseBackfillOptions([], {})).toEqual({
      batchSize: 200,
      mode: 'dry-run',
    });
    expect(parseBackfillOptions(['--apply', '--batch-size=5000'], {})).toEqual({
      batchSize: 1000,
      mode: 'apply',
    });
  });

  it('uses an incoming inspection supplier ID before legacy names', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: supplierB.name,
        inspection: {
          category: 'INCOMING',
          processSupplier: null,
          supplierById: supplierA,
          supplierByName: supplierB,
        },
        supplierByRecordName: supplierB,
      }),
    ).toEqual({
      action: 'update',
      candidate: supplierA,
      reason: 'INCOMING_INSPECTION_ID',
    });
  });

  it('requires an explicit TEAM mapping for process inspections', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: supplierA.name,
        inspection: {
          category: 'PROCESS',
          processSupplier: null,
          supplierById: null,
          supplierByName: null,
        },
        supplierByRecordName: supplierA,
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'MISSING_PROCESS_TEAM_LINK',
    });
  });

  it('does not overwrite a valid conflicting supplier ID', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: supplierA,
        existingSupplierId: supplierA.id,
        existingSupplierName: supplierA.name,
        inspection: {
          category: 'PROCESS',
          processSupplier: supplierB,
          supplierById: null,
          supplierByName: null,
        },
        supplierByRecordName: null,
      }),
    ).toEqual({
      action: 'conflict',
      candidate: supplierB,
      reason: 'CONFLICTING_IDENTITY',
    });
  });

  it('repairs an invalid supplier ID from canonical inspection evidence', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: 'legacy-id',
        existingSupplierName: supplierA.name,
        inspection: {
          category: 'INCOMING',
          processSupplier: null,
          supplierById: supplierA,
          supplierByName: supplierA,
        },
        supplierByRecordName: supplierA,
      }),
    ).toEqual({
      action: 'update',
      candidate: supplierA,
      reason: 'INCOMING_INSPECTION_ID',
    });
  });

  it('repairs a manual issue from one exact supplier name candidate', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: 'legacy-name-id',
        existingSupplierName: supplierA.name,
        inspection: null,
        supplierByRecordName: supplierA,
      }),
    ).toEqual({
      action: 'update',
      candidate: supplierA,
      reason: 'QUALITY_RECORD_NAME',
    });
  });

  it('keeps an invalid supplier ID unresolved without deterministic evidence', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: 'legacy-id',
        existingSupplierName: null,
        inspection: null,
        supplierByRecordName: null,
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'INVALID_EXISTING_ID',
    });
  });

  it('skips internal process records without supplier evidence', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: null,
        inspection: {
          category: 'PROCESS',
          processSupplier: null,
          supplierById: null,
          supplierByName: null,
        },
        supplierByRecordName: null,
      }),
    ).toEqual({
      action: 'skip',
      reason: 'NO_SUPPLIER_IDENTITY_REQUIRED',
    });
  });

  it('skips manual records without supplier evidence', () => {
    expect(
      resolveQualityRecordSupplierIdentity({
        existingSupplier: null,
        existingSupplierId: null,
        existingSupplierName: null,
        inspection: null,
        supplierByRecordName: null,
      }),
    ).toEqual({
      action: 'skip',
      reason: 'NO_SUPPLIER_IDENTITY_REQUIRED',
    });
  });

  it('only exposes names with one exact identity candidate', () => {
    expect([
      ...buildUniqueIdentityMap([supplierA, supplierB]).entries(),
    ]).toEqual([
      ['Supplier A', supplierA],
      ['Supplier B', supplierB],
    ]);
    expect(
      buildUniqueIdentityMap([
        supplierA,
        { id: 'supplier-a-duplicate', name: supplierA.name },
      ]).has(supplierA.name),
    ).toBe(false);
  });
});
