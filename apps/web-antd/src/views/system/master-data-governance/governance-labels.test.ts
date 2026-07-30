import { describe, expect, it } from 'vitest';

import {
  getGovernanceEntityLabel,
  getGovernanceFieldLabel,
  getGovernanceReasonLabel,
  getGovernanceStatusLabel,
} from './governance-labels';

describe('master data governance labels', () => {
  it('translates internal governance values into Chinese', () => {
    expect(getGovernanceStatusLabel('OPEN')).toBe('待处置');
    expect(getGovernanceEntityLabel('quality_records')).toBe('不合格项');
    expect(getGovernanceFieldLabel('defectClassification')).toBe('缺陷分类');
    expect(getGovernanceReasonLabel('classification_pair_not_found')).toBe(
      '未找到对应的分类组合',
    );
  });

  it('keeps an unknown internal value visible for diagnosis', () => {
    expect(getGovernanceReasonLabel('new_reason')).toBe('未知项（new_reason）');
  });
});
