import { describe, expect, it } from 'vitest';

import {
  mapDictionaryOptionsToLossType,
  mapDictionaryOptionsToQualityLossStatus,
} from './constants';

describe('mapDictionaryOptionsToLossType', () => {
  it('returns fallback type options when options is undefined', () => {
    const result = mapDictionaryOptionsToLossType(undefined);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('label');
    expect(result[0]).toHaveProperty('value');
  });

  it('returns fallback type options when options is empty', () => {
    expect(mapDictionaryOptionsToLossType([])).toEqual(
      mapDictionaryOptionsToLossType(undefined),
    );
  });

  it('maps dictionary options correctly', () => {
    const options = [
      { dictKey: 'SCRAP', dictValue: '报废' },
      { dictKey: 'REWORK', dictValue: '返工' },
    ];
    expect(mapDictionaryOptionsToLossType(options as any)).toEqual([
      { label: '报废', value: 'SCRAP' },
      { label: '返工', value: 'REWORK' },
    ]);
  });

  it('uses dictKey as label when dictValue is empty', () => {
    const options = [{ dictKey: 'OTHER', dictValue: '' }];
    expect(mapDictionaryOptionsToLossType(options as any)).toEqual([
      { label: 'OTHER', value: 'OTHER' },
    ]);
  });
});

describe('mapDictionaryOptionsToQualityLossStatus', () => {
  it('returns fallback status list when options is undefined', () => {
    const result = mapDictionaryOptionsToQualityLossStatus(undefined);
    expect(result.length).toBe(4);
    expect(result[0]).toHaveProperty('color');
    expect(result[0]).toHaveProperty('label');
    expect(result[0]).toHaveProperty('value');
  });

  it('returns fallback status list when options is empty', () => {
    expect(mapDictionaryOptionsToQualityLossStatus([])).toEqual(
      mapDictionaryOptionsToQualityLossStatus(undefined),
    );
  });

  it('maps dictionary options with correct color lookup', () => {
    const options = [
      { dictKey: 'Pending', dictValue: '待处理' },
      { dictKey: 'Resolved', dictValue: '已解决' },
    ];
    const result = mapDictionaryOptionsToQualityLossStatus(options as any);
    expect(result).toEqual([
      { value: 'Pending', label: '待处理', color: 'orange' },
      { value: 'Resolved', label: '已解决', color: 'cyan' },
    ]);
  });

  it('uses default color for unknown status key', () => {
    const options = [{ dictKey: 'UNKNOWN', dictValue: '未知' }];
    const result = mapDictionaryOptionsToQualityLossStatus(options as any);
    expect(result[0]?.color).toBe('default');
  });

  it('normalizes status key case for color lookup', () => {
    const options = [{ dictKey: 'pending', dictValue: '待处理' }];
    const result = mapDictionaryOptionsToQualityLossStatus(options as any);
    expect(result[0]?.color).toBe('orange');
  });
});
