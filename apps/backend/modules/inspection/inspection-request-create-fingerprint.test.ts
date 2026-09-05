import { describe, expect, it } from 'vitest';

import { buildInspectionRequestCreateRequestFingerprint } from './inspection-request-create-fingerprint';

const baseBody = {
  category: 'PROCESS',
  componentName: '阀体组件',
  partId: 'part-1',
  processId: 'proc-1',
  quantity: '10',
  reporter: '张三',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-1',
  workOrderNumber: 'WO-2026-001',
  workOrderNumbers: ['WO-2026-001'],
};

describe('buildInspectionRequestCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const first = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      attachments: [
        { fileId: 'f1', url: '/a.jpg' },
        { fileId: 'f2', url: '/b.jpg' },
      ],
      stationSelection: { indexes: ['2', '1'], mode: 'MULTI' },
    });
    const second = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      attachments: [
        { fileId: 'f2', url: '/b.jpg' },
        { fileId: 'f1', url: '/a.jpg' },
      ],
      stationSelection: { indexes: ['1', '2'], mode: 'MULTI' },
    });
    expect(second).toBe(first);
  });

  it('changes when a business identity field changes', () => {
    const first = buildInspectionRequestCreateRequestFingerprint(baseBody);
    const changed = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      partId: 'part-2',
    });
    expect(changed).not.toBe(first);
  });

  it('changes when the attachment set changes', () => {
    const first = buildInspectionRequestCreateRequestFingerprint(baseBody);
    const changed = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      attachments: [{ fileId: 'f1', url: '/a.jpg' }],
    });
    expect(changed).not.toBe(first);
  });

  it('ignores attachment order but not the set', () => {
    const first = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      attachments: [
        { fileId: 'f1', url: '/a.jpg' },
        { fileId: 'f2', url: '/b.jpg' },
      ],
    });
    const reordered = buildInspectionRequestCreateRequestFingerprint({
      ...baseBody,
      attachments: [
        { fileId: 'f2', url: '/b.jpg' },
        { fileId: 'f1', url: '/a.jpg' },
      ],
    });
    expect(reordered).toBe(first);
  });
});
