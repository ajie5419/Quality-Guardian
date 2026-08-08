export interface SupplierIdentityDraft {
  supplierId: string;
  teamId: string;
}

export interface SupplierIdentityDraftValidation {
  errors: Partial<Record<keyof SupplierIdentityDraft, string>>;
  value?: SupplierIdentityDraft;
}

export function validateSupplierIdentityDraft(
  draft: SupplierIdentityDraft,
): SupplierIdentityDraftValidation {
  const value = {
    supplierId: draft.supplierId.trim(),
    teamId: draft.teamId.trim(),
  };
  const errors: SupplierIdentityDraftValidation['errors'] = {};

  if (!value.teamId) errors.teamId = 'Select a TEAM.';
  if (!value.supplierId) errors.supplierId = 'Select a supplier.';

  return Object.keys(errors).length === 0 ? { errors, value } : { errors };
}
