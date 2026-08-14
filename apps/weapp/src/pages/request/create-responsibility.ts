import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';

type RequestCreateResponsibilityType =
  (typeof INSPECTION_ISSUE_RESPONSIBILITY_TYPE)[keyof typeof INSPECTION_ISSUE_RESPONSIBILITY_TYPE];

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

export function getRequestCreateResponsibilityTypes(
  category: '' | 'INCOMING' | 'PROCESS',
) {
  if (category === 'PROCESS') {
    return REQUEST_CREATE_RESPONSIBILITY_TYPES.filter(
      (type) => type !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
    );
  }
  if (category === 'INCOMING') {
    return REQUEST_CREATE_RESPONSIBILITY_TYPES.filter(
      (type) =>
        type !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
    );
  }
  return REQUEST_CREATE_RESPONSIBILITY_TYPES;
}

export function getRequestCreateResponsibilityLabels(
  category: '' | 'INCOMING' | 'PROCESS',
) {
  return getRequestCreateResponsibilityTypes(category).map((type) =>
    getRequestCreateResponsibilityLabel(type),
  );
}

function getRequestCreateResponsibilityLabel(
  type: RequestCreateResponsibilityType,
) {
  if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT) {
    return '内部部门';
  }
  if (type === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT) {
    return '外协单位';
  }
  return '供应商';
}

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

export function isRequestCreateExternalResponsibility(
  responsibilityType: RequestCreateResponsibilityType,
) {
  return (
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER ||
    responsibilityType === INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
  );
}

export function buildRequestCreateResponsibilityPayload(input: {
  responsibilityType: RequestCreateResponsibilityType;
  responsibleDepartmentId: string;
  supplierId: string;
}) {
  if (isRequestCreateExternalResponsibility(input.responsibilityType)) {
    const supplierId = input.supplierId.trim();
    return supplierId
      ? { responsibilityType: input.responsibilityType, supplierId }
      : null;
  }
  const responsibleDepartmentId = input.responsibleDepartmentId.trim();
  if (!responsibleDepartmentId) return null;
  if (
    input.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    return {
      responsibilityType: input.responsibilityType,
      responsibleDepartmentId,
    };
  }
  return null;
}
