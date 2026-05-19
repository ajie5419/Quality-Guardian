import { describe, expect, it } from 'vitest';

import {
  issueStatusColor,
  mapDictionaryOptionsToSupervisionIssueStatus,
  mapDictionaryOptionsToSupervisionProjectStatus,
  projectStatusColor,
} from './constants';

describe('supervision dictionary mapping', () => {
  it('returns fallback project status keys when dictionary is empty', () => {
    expect(mapDictionaryOptionsToSupervisionProjectStatus(undefined)).toEqual([
      { value: 'PLANNED', label: 'PLANNED' },
      { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
      { value: 'PAUSED', label: 'PAUSED' },
      { value: 'COMPLETED', label: 'COMPLETED' },
    ]);
  });

  it('maps project status dictionary options', () => {
    const options = [
      { dictKey: 'PLANNED', dictValue: '计划中（字典）' },
      { dictKey: 'PAUSED', dictValue: '暂停（字典）' },
    ];

    expect(
      mapDictionaryOptionsToSupervisionProjectStatus(options as any),
    ).toEqual([
      { value: 'PLANNED', label: '计划中（字典）' },
      { value: 'PAUSED', label: '暂停（字典）' },
    ]);
  });

  it('returns fallback issue status keys when dictionary is empty', () => {
    expect(mapDictionaryOptionsToSupervisionIssueStatus(undefined)).toEqual([
      { value: 'OPEN', label: 'OPEN' },
      { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
      { value: 'VERIFYING', label: 'VERIFYING' },
      { value: 'CLOSED', label: 'CLOSED' },
    ]);
  });

  it('maps issue status dictionary options', () => {
    const options = [
      { dictKey: 'OPEN', dictValue: '待处理（字典）' },
      { dictKey: 'VERIFYING', dictValue: '验证中（字典）' },
    ];

    expect(
      mapDictionaryOptionsToSupervisionIssueStatus(options as any),
    ).toEqual([
      { value: 'OPEN', label: '待处理（字典）' },
      { value: 'VERIFYING', label: '验证中（字典）' },
    ]);
  });

  it('uses normalized status key for color mapping', () => {
    expect(projectStatusColor(' planned ')).toBe('default');
    expect(projectStatusColor('in_progress')).toBe('blue');
    expect(issueStatusColor('verifying')).toBe('purple');
    expect(issueStatusColor('OPEN')).toBe('red');
  });
});
