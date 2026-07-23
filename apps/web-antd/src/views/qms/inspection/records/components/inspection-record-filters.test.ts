import { describe, expect, it } from 'vitest';

import {
  buildInspectionRecordExportRequestParams,
  buildInspectionRecordFilterParams,
  buildInspectionRecordListRequestParams,
  resolveInspectionRecordDateRangeQuery,
} from './inspection-record-filters';

describe('inspection record filters', () => {
  it('builds incoming and process filter parameters', () => {
    expect(
      buildInspectionRecordFilterParams({
        fallbackKeyword: 'route keyword',
        filters: {
          componentName: ' Gearbox ',
          hasDocuments: 'false',
          inspectionDateRange: ['2026-07-01', '2026-07-20'],
          inspector: ' Inspector A ',
          materialName: ' Bearing ',
          projectName: ' Project A ',
        },
      }),
    ).toMatchObject({
      componentName: 'Gearbox',
      endDate: '2026-07-20',
      hasDocuments: false,
      inspector: 'Inspector A',
      keyword: 'route keyword',
      materialName: 'Bearing',
      projectName: 'Project A',
      startDate: '2026-07-01',
    });
  });

  it('uses form values when local filters are empty', () => {
    expect(
      buildInspectionRecordFilterParams({
        filters: {},
        formValues: {
          componentName: 'Reducer',
          inspectionDateRange: ['2026-06-01', '2026-06-30'],
        },
      }),
    ).toMatchObject({
      componentName: 'Reducer',
      endDate: '2026-06-30',
      startDate: '2026-06-01',
    });
  });

  it('drops incomplete date ranges', () => {
    expect(resolveInspectionRecordDateRangeQuery(['2026-07-01'])).toEqual({});
    expect(resolveInspectionRecordDateRangeQuery(['', '2026-07-20'])).toEqual(
      {},
    );
  });

  it('builds exact source requests without unrelated list filters', () => {
    const context = {
      filters: { keyword: 'unrelated keyword' },
      sourceInspectionId: ' inspection-101 ',
      type: 'incoming',
      year: 2025,
    };

    expect(
      buildInspectionRecordListRequestParams({
        ...context,
        page: 8,
        pageSize: 100,
      }),
    ).toEqual({
      page: 1,
      pageSize: 1,
      sourceInspectionId: 'inspection-101',
      type: 'ALL',
    });
    expect(buildInspectionRecordExportRequestParams(context)).toEqual({
      sourceInspectionId: 'inspection-101',
      type: 'ALL',
    });
  });
});
