import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  isExternalInspectionIssueResponsibility,
  normalizeInspectionIssueCanonicalId,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';

export type LockedInspectionRequestIssueResponsibility = {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId?: string;
};

export type EditableInspectionRequestIssueResponsibility = {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
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

/**
 * A partial persisted fact must be completed explicitly, but its valid type
 * and canonical IDs remain useful form defaults. In particular, do not turn a
 * historical external task into an internal task just because the server
 * has not yet persisted its responsibility department.
 */
export function resolveEditableInspectionRequestIssueResponsibility(input: {
  category?: 'INCOMING' | 'PROCESS';
  value: unknown;
}): EditableInspectionRequestIssueResponsibility | null {
  if (!input.value || typeof input.value !== 'object') return null;
  const source = input.value as Record<string, unknown>;
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    source.responsibilityType,
  );
  if (
    !responsibilityType ||
    (input.category === 'PROCESS' &&
      responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER)
  ) {
    return null;
  }
  const isExternal =
    isExternalInspectionIssueResponsibility(responsibilityType);
  return {
    responsibilityType,
    responsibleDepartmentId: isExternal
      ? ''
      : normalizeInspectionIssueCanonicalId(source.responsibleDepartmentId),
    supplierId: isExternalInspectionIssueResponsibility(responsibilityType)
      ? normalizeInspectionIssueCanonicalId(source.supplierId)
      : '',
  };
}
