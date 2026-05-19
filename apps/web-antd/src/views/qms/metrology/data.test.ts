import { describe, expect, it, vi } from 'vitest';

import {
  getStatusOptions,
  mapDictionaryOptionsToMetrologyStatus,
} from './data';

vi.mock('@vben/locales', () => ({
  $t: (key: string) => key,
}));

describe('metrology status dictionary mapping', () => {
  it('falls back to builtin status options when dictionary is empty', () => {
    const fallback = getStatusOptions();
    expect(mapDictionaryOptionsToMetrologyStatus(undefined)).toEqual(fallback);
    expect(mapDictionaryOptionsToMetrologyStatus([])).toEqual(fallback);
  });

  it('maps dictionary options to status options', () => {
    const options = [
      { dictKey: 'VALID', dictValue: '有效' },
      { dictKey: 'EXPIRED', dictValue: '过期' },
    ];

    expect(mapDictionaryOptionsToMetrologyStatus(options as any)).toEqual([
      { label: '有效', value: 'VALID' },
      { label: '过期', value: 'EXPIRED' },
    ]);
  });

  it('falls back to dictKey when dictValue is empty', () => {
    expect(
      mapDictionaryOptionsToMetrologyStatus([
        { dictKey: 'PENDING', dictValue: '' },
      ] as any),
    ).toEqual([{ label: 'PENDING', value: 'PENDING' }]);
  });
});
