import { describe, expect, it } from 'vitest';

import { buildVehicleCommissioningIssueCreateRequestFingerprint } from './vehicle-commissioning-issue-create-fingerprint';

const baseBody = {
  description: '调试异响',
  isClaim: true,
  lossAmount: 500,
  partName: '整车',
  projectName: '项目甲',
  responsibleDepartment: '调试组',
  severity: 'major',
  workOrderNumber: 'WO-2026-001',
};

describe('buildVehicleCommissioningIssueCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const first = buildVehicleCommissioningIssueCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p1.jpg', '/p2.jpg'],
    });
    const second = buildVehicleCommissioningIssueCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p2.jpg', '/p1.jpg'],
    });
    expect(second).toBe(first);
  });

  it('changes when a business field changes', () => {
    const first =
      buildVehicleCommissioningIssueCreateRequestFingerprint(baseBody);
    const changed = buildVehicleCommissioningIssueCreateRequestFingerprint({
      ...baseBody,
      lossAmount: 800,
    });
    expect(changed).not.toBe(first);
  });

  it('normalizes boolean-ish isClaim values', () => {
    const first = buildVehicleCommissioningIssueCreateRequestFingerprint({
      ...baseBody,
      isClaim: true,
    });
    const normalized = buildVehicleCommissioningIssueCreateRequestFingerprint({
      ...baseBody,
      isClaim: '是',
    });
    expect(normalized).toBe(first);
  });
});
