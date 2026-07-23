// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';

import {
  buildIssueSearchQuery,
  resolveIssueDateRangeQuery,
  resolveIssueDivisionName,
} from './useIssueGridOptions';

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

describe('resolveIssueDateRangeQuery', () => {
  it('maps a complete picker value to API date boundaries', () => {
    expect(resolveIssueDateRangeQuery(['2026-07-01', '2026-07-20'])).toEqual({
      endDate: '2026-07-20',
      startDate: '2026-07-01',
    });
  });

  it('omits incomplete picker values', () => {
    expect(resolveIssueDateRangeQuery(['2026-07-01'])).toEqual({});
    expect(resolveIssueDateRangeQuery(undefined)).toEqual({});
  });
});

describe('buildIssueSearchQuery', () => {
  it('keeps the supplier filter consistent with the other issue filters', () => {
    expect(
      buildIssueSearchQuery({
        dateMode: 'month',
        dateValue: '2026-07',
        defaultProjectName: 'Route Project',
        defaultWorkOrderNumber: 'Route Work Order',
        formValues: {
          dateRange: ['2026-07-01', '2026-07-20'],
          processName: 'Incoming Inspection',
          projectName: 'Project A',
          responsibleDepartment: 'Quality',
          responsibleWelder: 'Welder A',
          status: 'OPEN',
          supplierName: 'Supplier A',
          workOrderNumber: 'WO-001',
        },
        year: 2026,
      }),
    ).toEqual({
      dateMode: 'month',
      dateValue: '2026-07',
      endDate: '2026-07-20',
      processName: 'Incoming Inspection',
      projectName: 'Project A',
      responsibleDepartment: 'Quality',
      responsibleWelder: 'Welder A',
      startDate: '2026-07-01',
      status: 'OPEN',
      supplierName: 'Supplier A',
      workOrderNumber: 'WO-001',
      year: 2026,
    });
  });
});
