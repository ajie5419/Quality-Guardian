import type { InspectionIssueResponsibilityType } from './inspection-request';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from './inspection-request';

export const INSPECTION_ISSUE_PERMISSION_CODES = {
  CREATE: 'QMS:Inspection:Issues:Create',
  DELETE: 'QMS:Inspection:Issues:Delete',
  EDIT: 'QMS:Inspection:Issues:Edit',
  LIST: 'QMS:Inspection:Issues:List',
  VIEW: 'QMS:Inspection:Issues:View',
} as const;

export const INSPECTION_ISSUE_FIELD_LIMITS = {
  DESCRIPTION: 5000,
  NC_NUMBER: 64,
  PHOTOS: 8,
  SHORT_TEXT: 255,
} as const;

export type InspectionIssueResponsibilityPayload = {
  responsibilityType?: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId?: string;
};

type InspectionIssueResponsibilityPayloadForInput<T> = T extends {
  responsibilityType: InspectionIssueResponsibilityType;
}
  ? Omit<InspectionIssueResponsibilityPayload, 'responsibilityType'> & {
      responsibilityType: InspectionIssueResponsibilityType;
    }
  : InspectionIssueResponsibilityPayload;

/**
 * Online clients must submit primitive canonical IDs. Labelled TreeSelect
 * values are intentionally rejected instead of being stringified.
 */
export function normalizeInspectionIssueCanonicalId(value: unknown): string {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  return String(value).trim();
}

export function normalizeInspectionIssueText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isExternalInspectionIssueResponsibility(
  value: unknown,
): boolean {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(value);
  return (
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER ||
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  );
}

/**
 * Every online issue entry point uses this payload contract. Presentation
 * snapshots and client NC values never cross the write boundary.
 */
export function buildInspectionIssuePayload<T extends Record<string, unknown>>(
  values: T,
): InspectionIssueResponsibilityPayloadForInput<T> &
  Omit<
    T,
    | 'ncNumber'
    | 'responsibilityType'
    | 'responsibleDepartment'
    | 'responsibleDepartmentId'
    | 'responsibleDepartments'
    | 'supplierId'
    | 'supplierName'
  > {
  const {
    ncNumber: _ncNumber,
    responsibleDepartment: _responsibleDepartment,
    responsibleDepartments: _responsibleDepartments,
    supplierName: _supplierName,
    responsibilityType,
    responsibleDepartmentId,
    supplierId,
    ...payload
  } = values;
  const normalizedResponsibilityType =
    normalizeInspectionIssueResponsibilityType(responsibilityType) ?? undefined;
  const isExternal = isExternalInspectionIssueResponsibility(
    normalizedResponsibilityType,
  );
  const normalizedSupplierId = normalizeInspectionIssueCanonicalId(supplierId);

  return {
    ...payload,
    responsibilityType: normalizedResponsibilityType,
    responsibleDepartmentId: normalizeInspectionIssueCanonicalId(
      responsibleDepartmentId,
    ),
    ...(isExternal && normalizedSupplierId
      ? { supplierId: normalizedSupplierId }
      : {}),
  } as InspectionIssueResponsibilityPayloadForInput<T> &
    Omit<
      T,
      | 'ncNumber'
      | 'responsibilityType'
      | 'responsibleDepartment'
      | 'responsibleDepartmentId'
      | 'responsibleDepartments'
      | 'supplierId'
      | 'supplierName'
    >;
}
