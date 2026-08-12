import type {
  InspectionIssueResponsibilityType,
  InspectionRequestResponsibilityDepartmentOption,
} from '@qgs/shared';

import {
  INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
} from '@qgs/shared';

/**
 * Legacy requests have no persisted responsibility triad. External types must
 * resolve their department from the policy name instead of picking an
 * arbitrary active department, and the result must be unique before close can
 * proceed.
 */
export function resolveLegacyExternalResponsibilityDepartment(options: {
  departments: InspectionRequestResponsibilityDepartmentOption[];
  responsibilityType: InspectionIssueResponsibilityType;
}): {
  department: InspectionRequestResponsibilityDepartmentOption | null;
  error: string;
} {
  const policyName =
    options.responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
      ? OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT
      : INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT;
  const matches = options.departments.filter(
    (department) => department.label === policyName,
  );
  if (matches.length === 1) {
    return { department: matches[0] ?? null, error: '' };
  }
  if (matches.length === 0) {
    return {
      department: null,
      error: `未找到「${policyName}」责任部门，无法提交不合格项。`,
    };
  }
  return {
    department: null,
    error: `「${policyName}」存在多个有效部门，无法自动确定，请联系管理员处置。`,
  };
}
