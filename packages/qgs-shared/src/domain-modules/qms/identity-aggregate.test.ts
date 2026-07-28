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
    expect(createIdentityAggregateItem({ id: null, value: 2 })).toEqual({
      id: null,
      name: 'Unknown',
      resolutionStatus: 'MISSING',
      value: 2,
    });
    expect(createIdentityAggregateItem({ id: 'deleted-id', value: 1 })).toEqual(
      {
        id: 'deleted-id',
        name: 'Unknown (deleted-id)',
        resolutionStatus: 'INVALID',
        value: 1,
      },
    );
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
