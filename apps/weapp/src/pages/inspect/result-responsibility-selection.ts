import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  isExternalInspectionIssueResponsibility,
} from '@qgs/shared';

const INSPECTION_RESULT_RESPONSIBILITY_TYPES = [
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
] as const;

export function getInspectionResultResponsibilityTypes(
  category?: 'INCOMING' | 'PROCESS',
) {
  return category === 'PROCESS'
    ? INSPECTION_RESULT_RESPONSIBILITY_TYPES.filter(
        (type) => type !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      )
    : INSPECTION_RESULT_RESPONSIBILITY_TYPES;
}

export function getInspectionResultResponsibilityLabels(
  category?: 'INCOMING' | 'PROCESS',
) {
  return getInspectionResultResponsibilityTypes(category).map((type) => {
    if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT) {
      return '内部部门';
    }
    if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT) {
      return '外协单位';
    }
    return '供应商';
  });
}

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
