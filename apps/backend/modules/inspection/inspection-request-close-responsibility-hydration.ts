import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';

export function hydrateOutsourcingLinkedIssueResponsibility(options: {
  linkedIssue: Record<string, unknown>;
  responsibility: { responsibleDepartmentId: string };
}) {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    options.linkedIssue.responsibilityType,
  );
  if (
    responsibilityType !==
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT &&
    responsibilityType !== INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER
  )
    return options.linkedIssue;
  return {
    ...options.linkedIssue,
    responsibleDepartmentId: options.responsibility.responsibleDepartmentId,
  };
}
