export interface MyInspectionRecordBadge {
  className: string;
  text: string;
}

/**
 * A PASS record that still links a non-conformance issue was reinspected and
 * accepted; the linked-issue fact is the display evidence for "复检合格".
 */
export function resolveMyInspectionRecordBadge(input: {
  inspectionResult?: unknown;
  linkedIssueId?: null | string;
  linkedIssueNo?: null | string;
  status?: unknown;
}): MyInspectionRecordBadge {
  if (
    String(input.status ?? '')
      .trim()
      .toUpperCase() === 'INSPECTING'
  ) {
    return { className: 'badge-inspecting', text: '待复检' };
  }
  if (
    String(input.inspectionResult ?? '')
      .trim()
      .toUpperCase() === 'PASS'
  ) {
    const hasLinkedIssue = Boolean(
      String(input.linkedIssueId ?? '').trim() ||
        String(input.linkedIssueNo ?? '').trim(),
    );
    return hasLinkedIssue
      ? { className: 'badge-reinspection', text: '复检合格' }
      : { className: 'badge-pass', text: '合格' };
  }
  return { className: 'badge-fail', text: '不合格' };
}
