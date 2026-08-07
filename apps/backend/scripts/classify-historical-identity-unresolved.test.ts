import { describe, expect, it } from 'vitest';

import { getDeterministicUnresolvedClassification } from './classify-historical-identity-unresolved';

describe('historical unresolved classification', () => {
  it('keeps unknown process references unresolved instead of guessing', () => {
    expect(
      getDeterministicUnresolvedClassification({
        category: 'PROCESS',
        entityType: 'inspections',
        fieldName: 'processId',
        rawIdState: null,
      }),
    ).toBeNull();
  });

  it('marks only non-process inspection process references as not applicable', () => {
    expect(
      getDeterministicUnresolvedClassification({
        category: 'INCOMING',
        entityType: 'inspections',
        fieldName: 'processId',
        rawIdState: null,
      }),
    ).toBe('NOT_APPLICABLE');
    expect(
      getDeterministicUnresolvedClassification({
        category: 'INCOMING',
        entityType: 'inspections',
        fieldName: 'partId',
        rawIdState: null,
      }),
    ).toBeNull();
  });

  it('preserves deterministically validated ID states ahead of applicability', () => {
    expect(
      getDeterministicUnresolvedClassification({
        category: 'INCOMING',
        entityType: 'inspections',
        fieldName: 'processId',
        rawIdState: 'RETIRED',
      }),
    ).toBe('RETIRED');
  });
});
