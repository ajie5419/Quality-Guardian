import { normalizeInspectionStationSelection } from '@qgs/shared';
import { describe, expect, it } from 'vitest';

import { assertInspectionRequestStationSelection } from './inspection-request-station-validation';

describe('inspection request station write validation', () => {
  it.each([
    undefined,
    null,
    { mode: 'PARTIAL', indexes: [] },
    { mode: 'PARTIAL', indexes: [4] },
    { mode: 'PARTIAL', indexes: [0] },
    { mode: 'PARTIAL', indexes: [-1] },
    { mode: 'PARTIAL', indexes: [1.5] },
    { mode: 'PARTIAL', indexes: [''] },
    { mode: 'PARTIAL', indexes: ['3.1'] },
    { mode: 'PARTIAL', indexes: [true] },
    { mode: 'PARTIAL', indexes: ['Infinity'] },
    { mode: 'ALL', indexes: [4] },
    { mode: 'UNKNOWN' },
    '',
  ])('rejects invalid required selection %j', (selection) => {
    expect(() =>
      assertInspectionRequestStationSelection(selection, 3, true),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION', httpStatus: 400 }));
  });

  it.each([
    { mode: 'ALL', indexes: [] },
    { mode: 'ALL' },
    { mode: 'PARTIAL', indexes: [1, 3] },
    { mode: 'PARTIAL', indexes: ['1', '3'] },
    { mode: 'PARTIAL', indexes: [2, 2] },
  ])('accepts valid selection %j', (selection) => {
    expect(() =>
      assertInspectionRequestStationSelection(selection, 3, true),
    ).not.toThrow();
  });

  it('allows omission for orders without required multi-station selection', () => {
    expect(() =>
      assertInspectionRequestStationSelection(undefined, 1, false),
    ).not.toThrow();
    expect(() =>
      assertInspectionRequestStationSelection(null, 0, false),
    ).not.toThrow();
    expect(() =>
      assertInspectionRequestStationSelection({ mode: 'ALL' }, 0, false),
    ).toThrow();
  });

  it('preserves tolerant historical reading without permitting such writes', () => {
    const historical = { mode: 'PARTIAL', indexes: [4] };
    expect(normalizeInspectionStationSelection(historical, 3)).toEqual({
      mode: 'PARTIAL',
      indexes: [3],
    });
    expect(() =>
      assertInspectionRequestStationSelection(historical, 3, false),
    ).toThrow();
  });
});
