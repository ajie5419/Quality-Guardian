import { describe, expect, it } from 'vitest';

import { buildRequestCreateResponsibilityPayload } from './create-responsibility';

describe('request create responsibility payload', () => {
  it.each([
    [
      {
        responsibilityType: 'INTERNAL_DEPARTMENT' as const,
        responsibleDepartmentId: 'dept-assembly',
        supplierId: 'supplier-stale',
        teamId: 'team-assembly',
      },
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
        teamId: 'team-assembly',
      },
    ],
    [
      {
        responsibilityType: 'SUPPLIER' as const,
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
        teamId: 'team-stale',
      },
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
    ],
    [
      {
        responsibilityType: 'OUTSOURCING_UNIT' as const,
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-b',
        teamId: 'team-stale',
      },
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-b',
      },
    ],
  ])(
    'keeps canonical IDs and drops incompatible identity fields',
    (input, expected) => {
      expect(buildRequestCreateResponsibilityPayload(input)).toEqual(expected);
    },
  );

  it('fails closed when the selected type is incomplete', () => {
    expect(
      buildRequestCreateResponsibilityPayload({
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: '',
        teamId: '',
      }),
    ).toBeNull();
  });
});
