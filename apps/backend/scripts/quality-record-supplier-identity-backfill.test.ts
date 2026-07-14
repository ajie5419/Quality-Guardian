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
