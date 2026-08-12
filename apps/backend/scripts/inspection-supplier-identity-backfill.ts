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
  teamIsExternal?: boolean;
  teamIsInternal?: boolean;
  teamById: null | TeamIdentity;
  teamByName: null | TeamIdentity;
}

export type InspectionIdentityResolution =
  | {
      action: 'clear';
      reason: 'INTERNAL_TEAM_SUPPLIER_FIELDS';
      team: TeamIdentity;
    }
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
  if (input.category === 'SHIPMENT') {
    return { action: 'unresolved', reason: 'UNSUPPORTED_INSPECTION_CATEGORY' };
  }

  if (input.category === 'INCOMING') {
    if (input.existingSupplierId && !input.existingSupplier) {
      return { action: 'unresolved', reason: 'INVALID_EXISTING_ID' };
    }
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
    if (input.existingSupplier?.id === supplier.id) {
      return { action: 'skip', reason: 'EXISTING_VALID_ID' };
    }
    return { action: 'update', supplier, team: null };
  }

  if (input.existingTeamId && !input.teamById) {
    return { action: 'unresolved', reason: 'INVALID_EXISTING_TEAM_ID' };
  }
  const team = input.teamById || input.teamByName;
  if (!team) {
    if (input.existingSupplier) {
      // PROCESS with a canonical supplier and no execution TEAM is valid
      // under the optional-TEAM contract; the supplier fact is already set.
      return { action: 'skip', reason: 'EXISTING_VALID_ID' };
    }
    return { action: 'unresolved', reason: 'MISSING_PROCESS_TEAM' };
  }
  if (input.teamIsInternal) {
    if (!input.existingSupplierId && !input.existingSupplierName) {
      return { action: 'skip', reason: 'NO_SUPPLIER_IDENTITY_REQUIRED' };
    }
    return {
      action: 'clear',
      reason: 'INTERNAL_TEAM_SUPPLIER_FIELDS',
      team,
    };
  }
  if (input.teamIsExternal && !input.processSupplier) {
    return { action: 'unresolved', reason: 'MISSING_PROCESS_TEAM_LINK' };
  }
  if (input.existingSupplierId && !input.existingSupplier) {
    return { action: 'unresolved', reason: 'INVALID_EXISTING_ID' };
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
    input.existingTeamId === team.id
  ) {
    return { action: 'skip', reason: 'EXISTING_VALID_ID' };
  }
  return { action: 'update', supplier: input.processSupplier, team };
}
