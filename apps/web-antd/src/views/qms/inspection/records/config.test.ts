import { describe, expect, it } from 'vitest';

import {
  mapDictionaryOptionsToInspectionProcess,
  mapDictionaryOptionsToInspectionProcessOnly,
} from './config';

describe('inspection records dictionary mapping', () => {
  it('returns fallback when dictionary options are missing', () => {
    const fallback = [{ label: '焊接', value: '焊接' }];

    expect(
      mapDictionaryOptionsToInspectionProcess(undefined, fallback),
    ).toEqual(fallback);
    expect(
      mapDictionaryOptionsToInspectionProcessOnly(undefined, fallback),
    ).toEqual(fallback);
  });

  it('merges dictionary and fallback options without duplicates', () => {
    const fallback = [
      { label: '焊接', value: '焊接' },
      { label: '组装', value: '组装' },
    ];
    const dictionary = [
      { dictKey: '焊接', dictValue: '焊接（字典）' },
      { dictKey: '外观', dictValue: '外观检查' },
    ];

    expect(
      mapDictionaryOptionsToInspectionProcess(dictionary as any, fallback),
    ).toEqual([
      { label: '焊接（字典）', value: '焊接' },
      { label: '外观检查', value: '外观' },
      { label: '组装', value: '组装' },
    ]);
  });

  it('returns only dictionary items in process-only mapper', () => {
    const fallback = [{ label: '焊接', value: '焊接' }];
    const dictionary = [{ dictKey: '外观', dictValue: '外观检查' }];

    expect(
      mapDictionaryOptionsToInspectionProcessOnly(dictionary as any, fallback),
    ).toEqual([{ label: '外观检查', value: '外观' }]);
  });
});
