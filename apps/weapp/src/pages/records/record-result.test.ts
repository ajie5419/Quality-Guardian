import { describe, expect, it } from 'vitest';

import { resolveMyInspectionRecordBadge } from './record-result';

describe('resolveMyInspectionRecordBadge', () => {
  it('shows 待复检 for INSPECTING records', () => {
    expect(
      resolveMyInspectionRecordBadge({
        inspectionResult: 'FAIL',
        status: 'INSPECTING',
      }),
    ).toEqual({ className: 'badge-inspecting', text: '待复检' });
  });

  it('shows 复检合格 for PASS with a linked issue', () => {
    expect(
      resolveMyInspectionRecordBadge({
        inspectionResult: 'PASS',
        linkedIssueId: 'issue-1',
        status: 'CLOSED',
      }),
    ).toEqual({ className: 'badge-reinspection', text: '复检合格' });
  });

  it('shows 复检合格 for PASS with a legacy issue number', () => {
    expect(
      resolveMyInspectionRecordBadge({
        inspectionResult: 'PASS',
        linkedIssueNo: 'NC-26KJ-001',
        status: 'CLOSED',
      }),
    ).toEqual({ className: 'badge-reinspection', text: '复检合格' });
  });

  it('shows 合格 for PASS without any linked issue', () => {
    expect(
      resolveMyInspectionRecordBadge({
        inspectionResult: 'PASS',
        status: 'CLOSED',
      }),
    ).toEqual({ className: 'badge-pass', text: '合格' });
  });

  it('shows 不合格 for FAIL', () => {
    expect(
      resolveMyInspectionRecordBadge({
        inspectionResult: 'FAIL',
        status: 'CLOSED',
      }),
    ).toEqual({ className: 'badge-fail', text: '不合格' });
  });
});
