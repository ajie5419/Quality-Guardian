import { describe, expect, it } from 'vitest';

import { mapRowsByColumnTitles } from './import-sheet';

describe('import sheet utils', () => {
  it('maps excel rows by normalized column titles', () => {
    const rows = [
      {
        ' 工单号 ': 'WO-001',
        '客户 名称': 'ACME',
      },
    ];
    const columns = [
      { field: 'workOrderNumber', title: '工单号' },
      { field: 'customerName', title: '客户名称' },
    ];

    expect(mapRowsByColumnTitles(rows, columns)).toEqual([
      {
        workOrderNumber: 'WO-001',
        customerName: 'ACME',
      },
    ]);
  });

  it('normalizes date values when mapping', () => {
    const rows = [
      {
        日期: new Date('2026-02-14T00:00:00.000Z'),
      },
    ];
    const columns = [{ field: 'date', title: '日期' }];

    const mapped = mapRowsByColumnTitles(rows, columns);
    expect(mapped[0]?.date).toBe('2026-02-14');
  });

  it('returns empty mapped object when no title matches are found', () => {
    const rows = [{ foo: 'bar' }];
    const columns = [{ field: 'workOrderNumber', title: '工单号' }];

    expect(mapRowsByColumnTitles(rows, columns)).toEqual([{}]);
  });
});
