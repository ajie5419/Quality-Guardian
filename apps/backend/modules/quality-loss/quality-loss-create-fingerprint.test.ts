import { describe, expect, it } from 'vitest';

import { buildQualityLossCreateRequestFingerprint } from './quality-loss-create-fingerprint';

const context = {
  partId: 'part-1',
  partName: '阀体',
  projectId: 'proj-1',
  projectName: '项目甲',
  workOrderNumber: 'WO-2026-001',
};

const baseBody = {
  actualClaim: 80,
  amount: 100,
  date: '2026-08-20',
  description: ' 批量划伤 ',
  responsibleDepartmentId: 'dept-1',
  type: 'Scrap',
  workOrderNumber: 'WO-2026-001',
};

describe('buildQualityLossCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const a = buildQualityLossCreateRequestFingerprint(baseBody, context);
    const b = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, partName: '阀体', description: '批量划伤' },
      context,
    );
    expect(a).toBe(b);
  });

  it('ignores volatile / UI-only fields (status, timestamps)', () => {
    const a = buildQualityLossCreateRequestFingerprint(baseBody, context);
    const b = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, status: 'PENDING', _t: 123_456_789 },
      context,
    );
    expect(a).toBe(b);
  });

  it('changes when the amount changes', () => {
    expect(
      buildQualityLossCreateRequestFingerprint(baseBody, context),
    ).not.toBe(
      buildQualityLossCreateRequestFingerprint(
        { ...baseBody, amount: 200 },
        context,
      ),
    );
  });

  it('changes when the work order changes', () => {
    expect(
      buildQualityLossCreateRequestFingerprint(baseBody, context),
    ).not.toBe(
      buildQualityLossCreateRequestFingerprint(
        { ...baseBody, workOrderNumber: 'WO-2026-002' },
        { ...context, workOrderNumber: 'WO-2026-002' },
      ),
    );
  });

  it('normalizes numeric strings to stable numbers', () => {
    const a = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, amount: 100 },
      context,
    );
    const b = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, amount: '100' },
      context,
    );
    expect(a).toBe(b);
  });

  it('stays stable when the occur date is missing (fallback is null, not now)', () => {
    const a = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, date: undefined },
      context,
    );
    const b = buildQualityLossCreateRequestFingerprint(
      { ...baseBody, date: undefined },
      context,
    );
    expect(a).toBe(b);
  });
});
