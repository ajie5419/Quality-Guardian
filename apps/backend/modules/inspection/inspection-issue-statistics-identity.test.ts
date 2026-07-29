import { describe, expect, it } from 'vitest';

import {
  getInspectionIssueStatisticsIdentityKey,
  resolveInspectionIssueStatisticsIdentity,
} from './inspection-issue-statistics-identity';

describe('inspection issue statistics identity', () => {
  it('preserves classification evidence for missing subcategory IDs', () => {
    const identity = resolveInspectionIssueStatisticsIdentity('defectSubtype', {
      defectSubtype: 'Machining accuracy',
      defectType: 'Process defect',
    });

    expect(identity).toEqual({
      id: null,
      rawName: 'Process defect / Machining accuracy',
    });
    expect(getInspectionIssueStatisticsIdentityKey(identity!)).toBe(
      'missing:MISSING_REQUIRED:Process defect / Machining accuracy',
    );
  });

  it('keeps distinct missing division snapshots in distinct buckets', () => {
    const road = resolveInspectionIssueStatisticsIdentity('division', {
      division: 'Road OBU',
    });
    const vehicle = resolveInspectionIssueStatisticsIdentity('division', {
      division: 'Vehicle OBU',
    });

    expect(getInspectionIssueStatisticsIdentityKey(road!)).not.toBe(
      getInspectionIssueStatisticsIdentityKey(vehicle!),
    );
  });

  it('distinguishes non-applicable suppliers from broken identities', () => {
    expect(
      resolveInspectionIssueStatisticsIdentity('supplierName', {}),
    ).toEqual({
      id: null,
      missingName: '不涉及供应商',
      rawName: null,
      resolutionReason: 'NOT_APPLICABLE',
    });
    expect(
      resolveInspectionIssueStatisticsIdentity('supplierName', {
        supplierName: 'Legacy supplier',
      }),
    ).toEqual({
      id: null,
      missingName: undefined,
      rawName: 'Legacy supplier',
      resolutionReason: 'MISSING_REQUIRED',
    });
  });
});
