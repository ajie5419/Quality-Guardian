import { describe, expect, it } from 'vitest';

import { buildInspectionIssueCreateRequestFingerprint } from './inspection-issue-create-fingerprint';

const baseBody = {
  defectCategoryId: 'cat-1',
  defectSubcategoryId: 'subcat-1',
  description: '焊接气孔',
  generateNcNumber: true,
  inspectionId: 'ins-1',
  partName: '阀体',
  processName: '焊接',
  quantity: 1,
  reportDate: '2026-08-20',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-1',
  rootCause: '参数漂移',
  severity: 'Major',
  solution: '调整参数',
  workOrderNumber: 'WO-2026-001',
};

describe('buildInspectionIssueCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const first = buildInspectionIssueCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p1.jpg', '/p2.jpg'],
    });
    const second = buildInspectionIssueCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p2.jpg', '/p1.jpg'],
    });
    expect(second).toBe(first);
  });

  it('changes when a business field changes', () => {
    const first = buildInspectionIssueCreateRequestFingerprint(baseBody);
    const changed = buildInspectionIssueCreateRequestFingerprint({
      ...baseBody,
      severity: 'Critical',
    });
    expect(changed).not.toBe(first);
  });

  it('ignores generateNcNumber=false toggling is not stable by design (business field)', () => {
    const first = buildInspectionIssueCreateRequestFingerprint({
      ...baseBody,
      generateNcNumber: true,
    });
    const changed = buildInspectionIssueCreateRequestFingerprint({
      ...baseBody,
      generateNcNumber: false,
    });
    expect(changed).not.toBe(first);
  });
});
