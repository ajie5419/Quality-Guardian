import { describe, expect, it } from 'vitest';

import {
  buildAfterSalesExplicitDateRange,
  parseAfterSalesListQuery,
} from './after-sales-query';
import {
  buildInspectionIssueDateRange,
  parseInspectionIssueDateBoundary,
  parseInspectionIssueListQuery,
} from './inspection-issue-query';

describe('after-sales list query', () => {
  it('preserves the canonical supplier ID filter', () => {
    expect(
      parseAfterSalesListQuery({
        supplierBrand: 'Legacy Supplier Name',
        supplierBrandId: ' supplier-1 ',
      }),
    ).toMatchObject({
      supplierBrand: 'Legacy Supplier Name',
      supplierBrandId: 'supplier-1',
    });
  });

  it('normalizes the expanded search filters and a valid date range', () => {
    expect(
      parseAfterSalesListQuery({
        customerName: '  Customer   A ',
        defectType: ' 制造装配缺陷 ',
        endDate: '2026-07-31',
        handler: ' Handler A ',
        productType: '车辆产品',
        projectName: ' Project A ',
        responsibleDept: ' dept-1 ',
        startDate: '2026-07-01',
        status: '处理中',
      }),
    ).toMatchObject({
      customerName: 'Customer A',
      defectType: '制造装配缺陷',
      endDate: '2026-07-31',
      handler: 'Handler A',
      productType: '车辆产品',
      projectName: 'Project A',
      responsibleDept: 'dept-1',
      startDate: '2026-07-01',
      status: 'IN_PROGRESS',
    });
  });

  it('rejects invalid or reversed explicit dates', () => {
    expect(
      parseAfterSalesListQuery({
        endDate: '2026-02-30',
        startDate: '2026-03-01',
      }),
    ).not.toMatchObject({
      endDate: expect.anything(),
      startDate: expect.anything(),
    });
    expect(
      buildAfterSalesExplicitDateRange({
        endDate: '2026-07-01',
        startDate: '2026-07-02',
      }),
    ).toBeUndefined();
  });

  it('uses an exclusive end boundary after the selected end day', () => {
    const range = buildAfterSalesExplicitDateRange({
      endDate: '2026-07-31',
      startDate: '2026-07-01',
    });
    expect(range?.start).toEqual(new Date(2026, 6, 1));
    expect(range?.end).toEqual(new Date(2026, 7, 1));
  });

  it('normalizes valid inspection issue date boundaries', () => {
    expect(
      parseInspectionIssueListQuery({
        endDate: ' 2026-07-20 ',
        startDate: ' 2026-07-01 ',
        supplierName: ' Supplier   A ',
      }),
    ).toMatchObject({
      endDate: '2026-07-20',
      startDate: '2026-07-01',
      supplierName: 'Supplier A',
    });
    expect(parseInspectionIssueDateBoundary('2026-02-30')).toBeUndefined();
  });

  it('uses an explicit inspection issue range before the year filter', () => {
    expect(
      buildInspectionIssueDateRange({
        endDate: '2026-07-20',
        startDate: '2026-07-01',
        year: 2025,
      }),
    ).toEqual({
      end: new Date(2026, 6, 21),
      start: new Date(2026, 6, 1),
    });
  });

  it('keeps the existing inspection issue year range without an explicit range', () => {
    expect(buildInspectionIssueDateRange({ year: 2025 })).toEqual({
      end: new Date(2026, 0, 1),
      start: new Date(2025, 0, 1),
    });
  });
});
