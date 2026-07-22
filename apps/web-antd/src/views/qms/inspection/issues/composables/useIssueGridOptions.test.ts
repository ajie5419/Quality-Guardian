// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import { resolveIssueDivisionName } from './useIssueGridOptions';

const departments = [
  {
    id: 'group-1',
    name: 'Operations',
    children: [
      {
        id: 'dept-vehicle',
        name: 'Vehicle OBU',
      },
    ],
  },
];

describe('resolveIssueDivisionName', () => {
  it('prefers the canonical divisionId mapping', () => {
    expect(
      resolveIssueDivisionName(departments, {
        division: 'Legacy Division',
        divisionId: 'dept-vehicle',
      }),
    ).toBe('Vehicle OBU');
  });

  it('maps a legacy division ID to its department name', () => {
    expect(
      resolveIssueDivisionName(departments, {
        division: 'dept-vehicle',
      }),
    ).toBe('Vehicle OBU');
  });

  it('preserves a legacy department name', () => {
    expect(
      resolveIssueDivisionName(departments, {
        division: 'Vehicle OBU',
      }),
    ).toBe('Vehicle OBU');
  });

  it('falls back to an unresolved divisionId instead of hiding it', () => {
    expect(
      resolveIssueDivisionName(departments, {
        divisionId: 'dept-unknown',
      }),
    ).toBe('dept-unknown');
  });
});
