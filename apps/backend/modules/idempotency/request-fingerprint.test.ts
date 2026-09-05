import { describe, expect, it } from 'vitest';

import { buildRequestFingerprint } from './request-fingerprint';

describe('buildRequestFingerprint', () => {
  it('is stable regardless of field order', () => {
    const a = buildRequestFingerprint({ amount: 100, type: 'Scrap' });
    const b = buildRequestFingerprint({ type: 'Scrap', amount: 100 });
    expect(a).toBe(b);
  });

  it('drops undefined fields so optional absence is stable', () => {
    const a = buildRequestFingerprint({ amount: 100, note: undefined });
    const b = buildRequestFingerprint({ amount: 100 });
    expect(a).toBe(b);
  });

  it('detects numeric value changes', () => {
    expect(buildRequestFingerprint({ amount: 100 })).not.toBe(
      buildRequestFingerprint({ amount: 101 }),
    );
  });

  it('detects string value changes', () => {
    expect(buildRequestFingerprint({ workOrderNumber: 'WO-1' })).not.toBe(
      buildRequestFingerprint({ workOrderNumber: 'WO-2' }),
    );
  });

  it('keeps nested objects stable and ordered', () => {
    const a = buildRequestFingerprint({
      responsibility: { deptId: 'd1', name: '采购部' },
      amount: 5,
    });
    const b = buildRequestFingerprint({
      amount: 5,
      responsibility: { name: '采购部', deptId: 'd1' },
    });
    expect(a).toBe(b);
  });
});
