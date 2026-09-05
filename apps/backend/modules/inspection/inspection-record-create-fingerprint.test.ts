import { describe, expect, it } from 'vitest';

import { buildInspectionRecordCreateRequestFingerprint } from './inspection-record-create-fingerprint';

const baseBody = {
  category: 'INCOMING',
  inspectionDate: '2026-08-20',
  inspector: '李四',
  items: [
    { checkItem: '尺寸', measuredValue: '10.0', result: 'PASS' },
    { checkItem: '外观', result: 'FAIL' },
  ],
  materialName: '阀体',
  partName: '阀体',
  processName: '进货检验',
  quantity: 10,
  qualifiedQuantity: 9,
  unqualifiedQuantity: 1,
  result: 'FAIL',
  workOrderNumber: 'WO-2026-001',
};

describe('buildInspectionRecordCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const first = buildInspectionRecordCreateRequestFingerprint(baseBody);
    const second = buildInspectionRecordCreateRequestFingerprint({
      ...baseBody,
      documents: 'doc-ref',
      selfCheckDocuments: 'self-ref',
      remarks: '备注',
    });
    expect(second).toBe(first);
  });

  it('changes when a business field changes', () => {
    const first = buildInspectionRecordCreateRequestFingerprint(baseBody);
    const changed = buildInspectionRecordCreateRequestFingerprint({
      ...baseBody,
      quantity: 12,
    });
    expect(changed).not.toBe(first);
  });

  it('changes when an item result changes', () => {
    const first = buildInspectionRecordCreateRequestFingerprint(baseBody);
    const changed = buildInspectionRecordCreateRequestFingerprint({
      ...baseBody,
      items: [{ checkItem: '尺寸', measuredValue: '10.0', result: 'PASS' }],
    });
    expect(changed).not.toBe(first);
  });
});
