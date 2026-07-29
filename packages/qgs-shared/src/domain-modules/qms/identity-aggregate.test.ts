import { describe, expect, it } from 'vitest';

import {
  createIdentityAggregateItem,
  createResolvedAggregateItem,
} from './identity-aggregate';

describe('identity aggregate contract', () => {
  it('returns the canonical identity when the ID resolves', () => {
    expect(
      createIdentityAggregateItem({
        canonicalName: 'Current name',
        id: 'identity-1',
        value: 3,
      }),
    ).toEqual({
      id: 'identity-1',
      name: 'Current name',
      resolutionStatus: 'RESOLVED',
      value: 3,
    });
  });

  it('keeps missing and invalid identities explicit', () => {
    expect(
      createIdentityAggregateItem({
        id: null,
        rawName: 'Legacy department',
        value: 2,
      }),
    ).toEqual({
      id: null,
      name: '数据待治理：Legacy department',
      rawName: 'Legacy department',
      resolutionReason: 'MISSING_REQUIRED',
      resolutionStatus: 'MISSING',
      value: 2,
    });
    expect(
      createIdentityAggregateItem({
        id: 'deleted-id',
        rawName: 'Deleted department',
        value: 1,
      }),
    ).toEqual({
      id: 'deleted-id',
      name: '主数据已失效：Deleted department',
      rawName: 'Deleted department',
      resolutionReason: 'INVALID_REFERENCE',
      resolutionStatus: 'INVALID',
      value: 1,
    });
  });

  it('distinguishes conflicts and non-applicable identities', () => {
    expect(
      createIdentityAggregateItem({
        id: null,
        rawName: 'Process / Machining',
        resolutionReason: 'CONFLICTED',
        value: 1,
      }),
    ).toEqual({
      id: null,
      name: '分类待治理：Process / Machining',
      rawName: 'Process / Machining',
      resolutionReason: 'CONFLICTED',
      resolutionStatus: 'MISSING',
      value: 1,
    });
    expect(
      createIdentityAggregateItem({
        id: null,
        missingName: 'No supplier involved',
        resolutionReason: 'NOT_APPLICABLE',
        value: 4,
      }),
    ).toEqual({
      id: null,
      name: 'No supplier involved',
      resolutionReason: 'NOT_APPLICABLE',
      resolutionStatus: 'MISSING',
      value: 4,
    });
  });

  it('creates stable items for non-master-data dimensions', () => {
    expect(
      createResolvedAggregateItem({ id: 'OPEN', name: 'Open', value: 4 }),
    ).toEqual({
      id: 'OPEN',
      name: 'Open',
      resolutionStatus: 'RESOLVED',
      value: 4,
    });
  });
});
