import { describe, expect, it } from 'vitest';

import {
  buildInspectionRecordDateRange,
  parseInspectionRecordListQuery,
} from './inspection-record';

describe('parseInspectionRecordListQuery', () => {
  it('normalizes inspection record list filters', () => {
    expect(
      parseInspectionRecordListQuery({
        componentName: ' Gearbox ',
        endDate: '2026-07-20',
        hasDocuments: 'false',
        inspector: ' Inspector A ',
        level1Component: ' Frame ',
        materialName: ' Bearing ',
        page: '2',
        pageSize: '20',
        processName: ' Welding ',
        projectName: ' Project A ',
        startDate: '2026-07-01',
        supplierName: ' Supplier A ',
        team: ' Team A ',
        type: 'process',
        workOrderNumber: ' WO-001 ',
        year: '2026',
      }),
    ).toEqual({
      componentName: 'Gearbox',
      endDate: '2026-07-20',
      hasDocuments: false,
      inspector: 'Inspector A',
      keyword: undefined,
      level1Component: 'Frame',
      materialName: 'Bearing',
      page: 2,
      pageSize: 20,
      processName: 'Welding',
      projectName: 'Project A',
      startDate: '2026-07-01',
      supplierName: 'Supplier A',
      team: 'Team A',
      type: 'PROCESS',
      workOrderNumber: 'WO-001',
      year: 2026,
    });
  });

  it('drops invalid date boundaries', () => {
    expect(
      parseInspectionRecordListQuery({
        endDate: '2026-02-30',
        startDate: 'not-a-date',
      }),
    ).toMatchObject({
      endDate: undefined,
      startDate: undefined,
    });
  });

  it('caps inspection record page size at one hundred rows', () => {
    expect(parseInspectionRecordListQuery({ pageSize: '1000' }).pageSize).toBe(
      100,
    );
  });

  it('builds an inclusive inspection date range with an exclusive end', () => {
    expect(
      buildInspectionRecordDateRange({
        endDate: '2026-07-20',
        startDate: '2026-07-01',
      }),
    ).toEqual({
      end: new Date(2026, 6, 21),
      start: new Date(2026, 6, 1),
    });
  });

  it('rejects incomplete or reversed inspection date ranges', () => {
    expect(
      buildInspectionRecordDateRange({ startDate: '2026-07-01' }),
    ).toBeUndefined();
    expect(
      buildInspectionRecordDateRange({
        endDate: '2026-07-01',
        startDate: '2026-07-20',
      }),
    ).toBeUndefined();
  });
});
