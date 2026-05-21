import {
  getIssueTrackingLabel,
  getIssueTrackingPaletteColor,
} from '#/views/qms/shared/utils/issue-tracking';

export function issueStatusColor(status: unknown) {
  return getIssueTrackingPaletteColor(status, {
    fallback: 'orange',
    resolvedColor: 'purple',
  });
}

export function issueStatusLabel(status: unknown) {
  return getIssueTrackingLabel(status, {
    labelPreset: 'verify',
  });
}
