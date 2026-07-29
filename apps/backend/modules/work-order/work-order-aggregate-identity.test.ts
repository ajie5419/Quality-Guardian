import { describe, expect, it } from 'vitest';

import { resolveAggregateIdentity } from './work-order-aggregate-identity';

describe('work-order aggregate identity', () => {
  it('exposes missing snapshot evidence without using it as identity', () => {
    expect(
      resolveAggregateIdentity({
        canonicalNames: new Map(),
        id: null,
        snapshot: 'Legacy process',
      }),
    ).toEqual({
      id: null,
      name: '数据待治理：Legacy process',
      rawName: 'Legacy process',
      resolutionReason: 'MISSING_REQUIRED',
      resolutionStatus: 'MISSING',
    });
  });

  it('marks an invalid ID and retains its diagnostic snapshot', () => {
    expect(
      resolveAggregateIdentity({
        canonicalNames: new Map([['process-deleted', null]]),
        id: 'process-deleted',
        snapshot: 'Deleted process',
      }),
    ).toEqual({
      id: 'process-deleted',
      name: '主数据已失效：Deleted process',
      rawName: 'Deleted process',
      resolutionReason: 'INVALID_REFERENCE',
      resolutionStatus: 'INVALID',
    });
  });
});
