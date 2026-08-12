import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

export const REQUEST_CREATE_RESPONSIBILITY_TYPES = [
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
] as const;

export const REQUEST_CREATE_RESPONSIBILITY_LABELS = [
  '内部部门',
  '供应商',
  '外协单位',
] as const;

export function isCurrentResponsibilityOptionsRequest(input: {
  currentResponsibilityType: string;
  currentSequence: number;
  requestedResponsibilityType: string;
  requestedSequence: number;
}) {
  return (
    input.currentSequence === input.requestedSequence &&
    input.currentResponsibilityType === input.requestedResponsibilityType
  );
}

export function buildRequestCreateResponsibilityPayload(input: {
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
  teamId: string;
  teamResponsibleDepartmentId?: string;
}) {
  const responsibleDepartmentId = input.responsibleDepartmentId.trim();
  if (!responsibleDepartmentId) return null;
  if (
    input.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    const teamId = input.teamId.trim();
    if (!teamId) {
      return {
        responsibilityType: input.responsibilityType,
        responsibleDepartmentId,
      };
    }
    if (input.teamResponsibleDepartmentId?.trim() !== responsibleDepartmentId) {
      return null;
    }
    return {
      responsibilityType: input.responsibilityType,
      responsibleDepartmentId,
      teamId,
    };
  }
  const supplierId = input.supplierId.trim();
  return supplierId
    ? {
        responsibilityType: input.responsibilityType,
        responsibleDepartmentId,
        supplierId,
      }
    : null;
}
