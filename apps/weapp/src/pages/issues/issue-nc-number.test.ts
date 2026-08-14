import { describe, expect, it } from 'vitest';

import { mergeAssignedNcNumber } from './issue-nc-number';

describe('mergeAssignedNcNumber', () => {
  it('preserves the existing detail projection when the assignment response is sparse', () => {
    const issue = {
      description: 'Surface scratch',
      id: 'issue-1',
      ncNumber: null,
      partName: 'Frame',
      photos: ['photo-1'],
      responsibleDepartment: 'Quality',
    } as never;

    expect(
      mergeAssignedNcNumber(issue, { ncNumber: 'NC-26KJ-001' } as never),
    ).toMatchObject({
      description: 'Surface scratch',
      ncNumber: 'NC-26KJ-001',
      partName: 'Frame',
      photos: ['photo-1'],
      responsibleDepartment: 'Quality',
    });
  });
});
