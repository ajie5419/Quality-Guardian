import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

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
