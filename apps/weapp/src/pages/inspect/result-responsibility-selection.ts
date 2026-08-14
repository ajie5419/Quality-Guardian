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
  if (category === 'PROCESS') {
    return INSPECTION_RESULT_RESPONSIBILITY_TYPES.filter(
      (type) => type !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
    );
  }
  if (category === 'INCOMING') {
    return INSPECTION_RESULT_RESPONSIBILITY_TYPES.filter(
      (type) =>
        type !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
    );
  }
  return INSPECTION_RESULT_RESPONSIBILITY_TYPES;
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
  if (!responsibilityType) return null;
  const supplierId = input.supplierId.trim();
  if (isExternalInspectionIssueResponsibility(responsibilityType)) {
    return supplierId ? { responsibilityType, supplierId } : null;
  }
  const responsibleDepartmentId = input.responsibleDepartmentId.trim();
  if (!responsibleDepartmentId) return null;
  return { responsibilityType, responsibleDepartmentId };
}
