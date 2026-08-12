import { describe, expect, it } from 'vitest';

import { isReinspectionPassedRecord } from './inspection-record-result';

describe('isReinspectionPassedRecord', () => {
  it('returns true for PASS with an OPEN linked issue', () => {
    expect(
      isReinspectionPassedRecord({ issueStatus: 'OPEN', result: 'PASS' }),
    ).toBe(true);
  });

  it('returns true for PASS with a CLOSED linked issue', () => {
    expect(
      isReinspectionPassedRecord({ issueStatus: 'CLOSED', result: 'PASS' }),
    ).toBe(true);
  });

  it('returns false for PASS without any linked issue', () => {
    expect(
      isReinspectionPassedRecord({ issueStatus: 'NONE', result: 'PASS' }),
    ).toBe(false);
    expect(
      isReinspectionPassedRecord({ issueStatus: '', result: 'PASS' }),
    ).toBe(false);
  });

  it('returns false for FAIL and other results', () => {
    expect(
      isReinspectionPassedRecord({ issueStatus: 'OPEN', result: 'FAIL' }),
    ).toBe(false);
    expect(
      isReinspectionPassedRecord({ issueStatus: 'OPEN', result: 'NA' }),
    ).toBe(false);
  });
});
