import type { inspection_category } from '@prisma/client';

import type { SupplierIdentity } from './quality-record-supplier-identity-backfill';
import type { TeamIdentity } from './supplier-identity-backfill-runtime';

export interface InspectionIdentityInput {
  category: inspection_category;
  existingSupplier: null | SupplierIdentity;
  existingSupplierId: null | string;
  existingSupplierName: null | string;
  existingTeamId: null | string;
  existingTeamName: null | string;
  processSupplier: null | SupplierIdentity;
  supplierByName: null | SupplierIdentity;
  teamById: null | TeamIdentity;
  teamByName: null | TeamIdentity;
}

export type InspectionIdentityResolution =
  | {
      action: 'conflict';
      candidate: SupplierIdentity;
      reason: 'CONFLICTING_IDENTITY';
    }
  | {
      action: 'skip';
      reason: 'EXISTING_VALID_ID' | 'NO_SUPPLIER_IDENTITY_REQUIRED';
    }
  | {
      action: 'unresolved';
      reason:
        | 'INVALID_EXISTING_ID'
        | 'INVALID_EXISTING_TEAM_ID'
        | 'MISSING_PROCESS_TEAM'
        | 'MISSING_PROCESS_TEAM_LINK'
        | 'NO_IDENTITY_EVIDENCE'
        | 'UNSUPPORTED_INSPECTION_CATEGORY';
    }
  | {
      action: 'update';
      supplier: SupplierIdentity;
      team: null | TeamIdentity;
    };

export function resolveInspectionSupplierIdentity(
  input: InspectionIdentityInput,
): InspectionIdentityResolution {
  if (input.existingSupplierId && !input.existingSupplier) {
    return { action: 'unresolved', reason: 'INVALID_EXISTING_ID' };
  }

  if (input.category === 'SHIPMENT') {
    return { action: 'unresolved', reason: 'UNSUPPORTED_INSPECTION_CATEGORY' };
  }

  if (input.category === 'INCOMING') {
    const candidate = input.supplierByName;
    if (
      input.existingSupplier &&
      candidate &&
      input.existingSupplier.id !== candidate.id
    ) {
      return {
        action: 'conflict',
        candidate,
        reason: 'CONFLICTING_IDENTITY',
      };
    }
    const supplier = input.existingSupplier || candidate;
    if (!supplier) {
      return { action: 'unresolved', reason: 'NO_IDENTITY_EVIDENCE' };
    }
    if (
      input.existingSupplier?.id === supplier.id &&
      input.existingSupplierName === supplier.name
    ) {
      return { action: 'skip', reason: 'EXISTING_VALID_ID' };
    }
    return { action: 'update', supplier, team: null };
  }

  if (input.existingTeamId && !input.teamById) {
    return { action: 'unresolved', reason: 'INVALID_EXISTING_TEAM_ID' };
  }
  const team = input.teamById || input.teamByName;
  if (!team) {
    return { action: 'unresolved', reason: 'MISSING_PROCESS_TEAM' };
  }
  if (!input.processSupplier) {
    if (!input.existingSupplierId && !input.existingSupplierName) {
      return { action: 'skip', reason: 'NO_SUPPLIER_IDENTITY_REQUIRED' };
    }
    return { action: 'unresolved', reason: 'MISSING_PROCESS_TEAM_LINK' };
  }
  if (
    input.existingSupplier &&
    input.existingSupplier.id !== input.processSupplier.id
  ) {
    return {
      action: 'conflict',
      candidate: input.processSupplier,
      reason: 'CONFLICTING_IDENTITY',
    };
  }
  if (
    input.existingSupplier?.id === input.processSupplier.id &&
    input.existingSupplierName === input.processSupplier.name &&
    input.existingTeamId === team.id &&
    input.existingTeamName === team.name
  ) {
    return { action: 'skip', reason: 'EXISTING_VALID_ID' };
  }
  return { action: 'update', supplier: input.processSupplier, team };
}
