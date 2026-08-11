import { describe, expect, it } from 'vitest';

import { buildInspectionResultResponsibilityPayload } from './result-responsibility-selection';

describe('mobile inspection close responsibility payload', () => {
  it.each([
    [
      'INTERNAL_DEPARTMENT',
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-a',
        supplierId: 'supplier-stale',
      },
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-a',
      },
    ],
    [
      'SUPPLIER',
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
      {
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
    ],
    [
      'OUTSOURCING_UNIT',
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-b',
      },
      {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-b',
      },
    ],
  ] as const)(
    'assembles canonical %s close responsibility',
    (_, input, expected) => {
      expect(buildInspectionResultResponsibilityPayload(input)).toEqual(
        expected,
      );
    },
  );

  it('fails closed when an external supplier ID is missing', () => {
    expect(
      buildInspectionResultResponsibilityPayload({
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: '',
      }),
    ).toBeNull();
  });
});
