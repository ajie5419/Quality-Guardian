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
  return {
    responsibilityType,
    responsibleDepartmentId,
    ...(supplierId ? { supplierId } : {}),
  };
}
