import { describe, expect, it } from 'vitest';

import { resolveInspectionSupplierIdentity } from './inspection-supplier-identity-backfill';

const supplierA = { id: 'supplier-a', name: 'Supplier A' };
const supplierB = { id: 'supplier-b', name: 'Supplier B' };
const teamA = { id: 'team-a', name: 'Team A' };

function resolve(
  input: Partial<Parameters<typeof resolveInspectionSupplierIdentity>[0]>,
) {
  return resolveInspectionSupplierIdentity({
    category: 'INCOMING',
    existingSupplier: null,
    existingSupplierId: null,
    existingSupplierName: null,
    existingTeamId: null,
    existingTeamName: null,
    processSupplier: null,
    supplierByName: null,
    teamById: null,
    teamByName: null,
    ...input,
  });
}

describe('inspection supplier identity backfill', () => {
  it('resolves an incoming inspection from one exact supplier name', () => {
    expect(resolve({ supplierByName: supplierA })).toEqual({
      action: 'update',
      supplier: supplierA,
      team: null,
    });
  });

  it('does not overwrite an invalid existing supplier ID', () => {
    expect(
      resolve({ existingSupplierId: 'legacy-id', supplierByName: supplierA }),
    ).toEqual({
      action: 'unresolved',
      reason: 'INVALID_EXISTING_ID',
    });
  });

  it('resolves a process inspection through an explicit TEAM link', () => {
    expect(
      resolve({
        category: 'PROCESS',
        processSupplier: supplierA,
        teamByName: teamA,
      }),
    ).toEqual({
      action: 'update',
      supplier: supplierA,
      team: teamA,
    });
  });

  it('does not require a supplier identity for an internal TEAM', () => {
    expect(resolve({ category: 'PROCESS', teamById: teamA })).toEqual({
      action: 'skip',
      reason: 'NO_SUPPLIER_IDENTITY_REQUIRED',
    });
  });

  it('clears an erroneous supplier identity for a DEPARTMENT-sourced TEAM', () => {
    expect(
      resolve({
        category: 'PROCESS',
        existingSupplier: supplierA,
        existingSupplierId: supplierA.id,
        existingSupplierName: supplierA.name,
        teamById: teamA,
        teamIsInternal: true,
      }),
    ).toEqual({
      action: 'clear',
      reason: 'INTERNAL_TEAM_SUPPLIER_FIELDS',
      team: teamA,
    });
  });

  it('keeps a PROCESS record with a canonical supplier and no TEAM', () => {
    expect(
      resolve({
        category: 'PROCESS',
        existingSupplier: supplierA,
        existingSupplierId: 'supplier-a',
        existingSupplierName: 'Supplier A',
      }),
    ).toEqual({ action: 'skip', reason: 'EXISTING_VALID_ID' });
  });

  it('audits supplier evidence without an explicit TEAM mapping', () => {
    expect(
      resolve({
        category: 'PROCESS',
        existingSupplierName: supplierA.name,
        teamById: teamA,
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'MISSING_PROCESS_TEAM_LINK',
    });
  });

  it('audits an external TEAM without a valid link even without supplier fields', () => {
    expect(
      resolve({
        category: 'PROCESS',
        teamById: teamA,
        teamIsExternal: true,
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'MISSING_PROCESS_TEAM_LINK',
    });
  });

  it('audits a valid supplier that conflicts with the TEAM mapping', () => {
    expect(
      resolve({
        category: 'PROCESS',
        existingSupplier: supplierB,
        existingSupplierId: supplierB.id,
        processSupplier: supplierA,
        teamById: teamA,
      }),
    ).toEqual({
      action: 'conflict',
      candidate: supplierA,
      reason: 'CONFLICTING_IDENTITY',
    });
  });
});
