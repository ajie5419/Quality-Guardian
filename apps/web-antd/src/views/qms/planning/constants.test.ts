import { describe, expect, it } from 'vitest';

import { mapDictionaryOptionsToPlanningProjectStatus } from './constants';

describe('mapDictionaryOptionsToPlanningProjectStatus', () => {
  it('returns fallback when options is undefined', () => {
    const fallback = [{ label: 'Default', value: 'default' }];
    expect(
      mapDictionaryOptionsToPlanningProjectStatus(undefined, fallback),
    ).toEqual(fallback);
  });

  it('returns fallback when options is empty array', () => {
    const fallback = [{ label: 'Fallback', value: 'fb' }];
    expect(mapDictionaryOptionsToPlanningProjectStatus([], fallback)).toEqual(
      fallback,
    );
  });

  it('returns empty array as default fallback when no fallback provided', () => {
    expect(mapDictionaryOptionsToPlanningProjectStatus(undefined)).toEqual([]);
  });

  it('maps dictionary options correctly', () => {
    const options = [
      { dictKey: 'active', dictValue: '活跃' },
      { dictKey: 'archived', dictValue: '已归档' },
    ];
    expect(mapDictionaryOptionsToPlanningProjectStatus(options as any)).toEqual(
      [
        { label: '活跃', value: 'active' },
        { label: '已归档', value: 'archived' },
      ],
    );
  });

  it('uses dictKey as label when dictValue is falsy', () => {
    const options = [{ dictKey: 'OPEN', dictValue: '' }];
    expect(mapDictionaryOptionsToPlanningProjectStatus(options as any)).toEqual(
      [{ label: 'OPEN', value: 'OPEN' }],
    );
  });
});
