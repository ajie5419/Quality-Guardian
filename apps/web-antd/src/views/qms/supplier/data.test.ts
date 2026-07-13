import { describe, expect, it, vi } from 'vitest';

import {
  getColumns,
  getStatusOptions,
  mapDictionaryOptionsToSelect,
} from './data';

vi.mock('@vben/locales', () => ({
  $t: (key: string) => key,
}));

describe('supplier data dictionary mapping', () => {
  it('falls back to builtin status options when dictionary is empty', () => {
    const fallback = getStatusOptions();

    expect(mapDictionaryOptionsToSelect(undefined)).toEqual(fallback);
    expect(mapDictionaryOptionsToSelect([])).toEqual(fallback);
  });

  it('maps dictionary options to select options', () => {
    const options = [
      { dictKey: 'Qualified', dictValue: '合格' },
      { dictKey: 'Frozen', dictValue: '冻结' },
    ];

    expect(mapDictionaryOptionsToSelect(options as any)).toEqual([
      { label: '合格', value: 'Qualified' },
      { label: '冻结', value: 'Frozen' },
    ]);
  });

  it('falls back to dictKey when dictValue is empty', () => {
    expect(
      mapDictionaryOptionsToSelect([
        { dictKey: 'Trial', dictValue: '' },
      ] as any),
    ).toEqual([{ label: 'Trial', value: 'Trial' }]);
  });
});

describe('supplier metric columns', () => {
  it('labels outsourcing yield as processing qualified rate', () => {
    const columns = getColumns('Outsourcing') as any[];
    const rateColumn = columns.find(
      (column) => column.field === 'incomingQualifiedRate',
    );

    expect(rateColumn.title).toBe('qms.outsourcing.qualifiedRate');
    expect(rateColumn.formatter({ cellValue: null })).toBe('-');
    expect(rateColumn.formatter({ cellValue: 0 })).toBe('0%');
  });
});
