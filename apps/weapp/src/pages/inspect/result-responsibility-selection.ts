import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import { isExternalInspectionIssueResponsibility } from '@qgs/shared';

export function buildInspectionResultResponsibilityPayload(input: {
  responsibilityType: '' | InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
}) {
  const responsibilityType = input.responsibilityType;
  const responsibleDepartmentId = input.responsibleDepartmentId.trim();
  if (!responsibilityType || !responsibleDepartmentId) return null;
  if (!isExternalInspectionIssueResponsibility(responsibilityType)) {
    return { responsibilityType, responsibleDepartmentId };
  }
  const supplierId = input.supplierId.trim();
  return supplierId
    ? { responsibilityType, responsibleDepartmentId, supplierId }
    : null;
}
