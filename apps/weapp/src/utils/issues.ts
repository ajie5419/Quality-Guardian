import {
  CLAIM_STATUS,
  INSPECTION_ISSUE_CLAIM_OPTIONS,
  INSPECTION_ISSUE_DEFAULT_VALUES,
  INSPECTION_ISSUE_DEFECT_OPTIONS,
  INSPECTION_ISSUE_DEFECT_SUBTYPES,
  INSPECTION_ISSUE_SEVERITY_OPTIONS,
  INSPECTION_ISSUE_STATUS_UI_MAP,
  InspectionIssueStatusEnum,
} from '@qgs/shared';

export const ISSUE_STATUS_OPTIONS = Object.values(
  InspectionIssueStatusEnum,
).map((value) => ({
  value,
  label: INSPECTION_ISSUE_STATUS_UI_MAP[value].label,
}));

export const ISSUE_SEVERITY_OPTIONS = [...INSPECTION_ISSUE_SEVERITY_OPTIONS];

export const ISSUE_CLAIM_OPTIONS = [...INSPECTION_ISSUE_CLAIM_OPTIONS];

export const ISSUE_DEFECT_TYPES = [...INSPECTION_ISSUE_DEFECT_OPTIONS];

export const ISSUE_DEFECT_SUBTYPES: Record<string, readonly string[]> =
  INSPECTION_ISSUE_DEFECT_SUBTYPES;

export const ISSUE_DEFAULTS = {
  ...INSPECTION_ISSUE_DEFAULT_VALUES,
  DEFAULT_CLAIM: CLAIM_STATUS.NO,
};

export function getIssueStatusLabel(status: string) {
  const key = String(status || '')
    .trim()
    .toUpperCase();
  return (
    INSPECTION_ISSUE_STATUS_UI_MAP[
      key as keyof typeof INSPECTION_ISSUE_STATUS_UI_MAP
    ]?.label || status
  );
}

export function getIssueSeverityLabel(severity: string) {
  return (
    ISSUE_SEVERITY_OPTIONS.find((item) => item.value === severity)?.label ||
    severity
  );
}
