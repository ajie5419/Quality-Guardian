import { describe, expect, it, vi } from 'vitest';

import { getStatusOptions, mapDictionaryOptionsToSelect } from './data';

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
