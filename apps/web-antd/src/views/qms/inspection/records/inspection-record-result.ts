import {
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
} from '@qgs/shared';

/**
 * A PASS record that still links a non-conformance issue was reinspected and
 * accepted. The record model keeps only PASS/FAIL, so the linked-issue fact is
 * the display evidence for "复检合格".
 */
export function isReinspectionPassedRecord(input: {
  issueStatus?: unknown;
  result?: unknown;
}) {
  if (
    String(input.result ?? '')
      .trim()
      .toUpperCase() !== 'PASS'
  )
    return false;
  const issueStatus = normalizeIssueTrackingStatus(input.issueStatus, {
    allowed: [
      ISSUE_TRACKING_STATUS.NO_ISSUE,
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.NO_ISSUE,
  });
  return issueStatus !== ISSUE_TRACKING_STATUS.NO_ISSUE;
}
