import { describe, expect, it } from 'vitest';

import { buildAfterSalesSearchParams } from './composables/useAfterSalesGrid';
import { mapDictionaryOptionsToAfterSalesStatus } from './constants';

describe('after-sales status dictionary mapping', () => {
  it('preserves fallback color when dictionary key matches', () => {
    const fallback = [
      { value: 'IN_PROGRESS', label: '处理中', color: 'blue' },
      { value: 'COMPLETED', label: '已完成', color: 'green' },
    ];

    const result = mapDictionaryOptionsToAfterSalesStatus(
      [
        { dictKey: 'in_progress', dictValue: '处理中（字典）' },
        { dictKey: 'BLOCKED', dictValue: '阻塞' },
      ] as any,
      fallback,
    );

    expect(result).toEqual([
      { value: 'in_progress', label: '处理中（字典）', color: 'blue' },
      { value: 'BLOCKED', label: '阻塞', color: 'default' },
    ]);
  });

  it('falls back to dictKey when dictValue is empty', () => {
    const result = mapDictionaryOptionsToAfterSalesStatus(
      [{ dictKey: 'IN_PROGRESS', dictValue: '' }] as any,
      [{ value: 'IN_PROGRESS', label: '处理中', color: 'blue' }],
    );

    expect(result).toEqual([
      { value: 'IN_PROGRESS', label: 'IN_PROGRESS', color: 'blue' },
    ]);
  });

  it('returns fallback when dictionary options are missing', () => {
    const fallback = [{ value: 'IN_PROGRESS', label: '处理中', color: 'blue' }];

    expect(mapDictionaryOptionsToAfterSalesStatus(undefined, fallback)).toEqual(
      fallback,
    );
  });

  it('normalizes search filters and maps the date range to API fields', () => {
    expect(
      buildAfterSalesSearchParams({
        customerName: '  Customer   A ',
        dateRange: ['2026-07-01', '2026-07-31'],
        handler: ' Handler A ',
        partName: ' Part   A ',
        responsibleDept: ' dept-1 ',
        status: 'IN_PROGRESS',
      }),
    ).toMatchObject({
      customerName: 'Customer A',
      endDate: '2026-07-31',
      handler: 'Handler A',
      partName: 'Part A',
      responsibleDept: 'dept-1',
      startDate: '2026-07-01',
      status: 'IN_PROGRESS',
    });
  });

  it('omits incomplete date ranges', () => {
    const params = buildAfterSalesSearchParams({
      dateRange: ['2026-07-01'],
    });
    expect(params).not.toHaveProperty('startDate');
    expect(params).not.toHaveProperty('endDate');
  });
});
