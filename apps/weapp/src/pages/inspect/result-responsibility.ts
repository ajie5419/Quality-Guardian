import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import {
  isExternalInspectionIssueResponsibility,
  normalizeInspectionIssueCanonicalId,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';

export type LockedInspectionRequestIssueResponsibility = {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId?: string;
};

function hasStoredValue(value: unknown) {
  return typeof value === 'string'
    ? Boolean(value.trim())
    : value !== null && value !== undefined;
}

/**
 * Only fully empty legacy context may be rebuilt during close. A partial
 * context is a data-integrity error and must remain fail-closed so it cannot
 * silently overwrite an existing server decision.
 */
export function hasEmptyInspectionRequestIssueResponsibilityContext(
  value: unknown,
) {
  if (!value || typeof value !== 'object') return true;
  const source = value as Record<string, unknown>;
  return ![
    source.responsibilityType,
    source.responsibleDepartment,
    source.responsibleDepartmentId,
  ].some((item) => hasStoredValue(item));
}

/**
 * The server owns request responsibility. Mobile may only use canonical IDs
 * supplied by that context and must never rebuild them from display names.
 */
export function resolveLockedInspectionRequestIssueResponsibility(
  value: unknown,
): LockedInspectionRequestIssueResponsibility | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    source.responsibilityType,
  );
  const responsibleDepartmentId = normalizeInspectionIssueCanonicalId(
    source.responsibleDepartmentId,
  );
  if (!responsibilityType || !responsibleDepartmentId) return null;
  const supplierId = normalizeInspectionIssueCanonicalId(source.supplierId);
  if (
    isExternalInspectionIssueResponsibility(responsibilityType) &&
    !supplierId
  ) {
    return null;
  }
  if (
    !isExternalInspectionIssueResponsibility(responsibilityType) &&
    supplierId
  ) {
    return null;
  }
  return {
    responsibilityType,
    responsibleDepartmentId,
    ...(supplierId ? { supplierId } : {}),
  };
}
