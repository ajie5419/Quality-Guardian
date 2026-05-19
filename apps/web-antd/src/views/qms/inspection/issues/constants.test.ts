import { describe, expect, it } from 'vitest';

import { mapDictionaryOptionsToIssueStatus } from './constants';

describe('inspection issue status dictionary mapping', () => {
  it('uses fallback colors by normalized status key', () => {
    const fallback = [
      { value: 'OPEN', label: '待处理', color: 'red' },
      { value: 'IN_PROGRESS', label: '处理中', color: 'orange' },
      { value: 'CLOSED', label: '已关闭', color: 'green' },
    ];

    const result = mapDictionaryOptionsToIssueStatus(
      [
        { dictKey: ' open ', dictValue: '待处理（字典）' },
        { dictKey: 'HOLD', dictValue: '挂起' },
      ] as any,
      fallback,
    );

    expect(result).toEqual([
      { value: ' open ', label: '待处理（字典）', color: 'red' },
      { value: 'HOLD', label: '挂起', color: 'default' },
    ]);
  });

  it('falls back to dictKey when dictValue is empty', () => {
    const result = mapDictionaryOptionsToIssueStatus(
      [{ dictKey: 'OPEN', dictValue: '' }] as any,
      [{ value: 'OPEN', label: '待处理', color: 'red' }],
    );

    expect(result).toEqual([{ value: 'OPEN', label: 'OPEN', color: 'red' }]);
  });

  it('returns fallback when dictionary options are empty', () => {
    const fallback = [{ value: 'OPEN', label: '待处理', color: 'red' }];

    expect(mapDictionaryOptionsToIssueStatus([], fallback)).toEqual(fallback);
  });
});
