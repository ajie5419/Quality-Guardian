import { describe, expect, it } from 'vitest';

import { parseInspectionRecordListQuery } from './inspection-record';

describe('parseInspectionRecordListQuery', () => {
  it('normalizes inspection record list filters', () => {
    expect(
      parseInspectionRecordListQuery({
        hasDocuments: 'false',
        inspector: ' Inspector A ',
        level1Component: ' Frame ',
        page: '2',
        pageSize: '20',
        processName: ' Welding ',
        supplierName: ' Supplier A ',
        team: ' Team A ',
        type: 'process',
        workOrderNumber: ' WO-001 ',
        year: '2026',
      }),
    ).toEqual({
      hasDocuments: false,
      inspector: 'Inspector A',
      keyword: undefined,
      level1Component: 'Frame',
      page: 2,
      pageSize: 20,
      processName: 'Welding',
      projectName: undefined,
      supplierName: 'Supplier A',
      team: 'Team A',
      type: 'PROCESS',
      workOrderNumber: 'WO-001',
      year: 2026,
    });
  });
});
