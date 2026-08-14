import { describe, expect, it } from 'vitest';

import {
  buildInspectionResultResponsibilityPayload,
  getInspectionResultResponsibilityLabels,
  getInspectionResultResponsibilityTypes,
} from './result-responsibility-selection';

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

  it('keeps all types for incoming or uncategorized tasks and excludes supplier for process tasks', () => {
    expect(getInspectionResultResponsibilityTypes('INCOMING')).toEqual([
      'INTERNAL_DEPARTMENT',
      'SUPPLIER',
      'OUTSOURCING_UNIT',
    ]);
    expect(getInspectionResultResponsibilityTypes('PROCESS')).toEqual([
      'INTERNAL_DEPARTMENT',
      'OUTSOURCING_UNIT',
    ]);
    expect(getInspectionResultResponsibilityTypes()).toEqual([
      'INTERNAL_DEPARTMENT',
      'SUPPLIER',
      'OUTSOURCING_UNIT',
    ]);
    expect(getInspectionResultResponsibilityLabels('PROCESS')).toEqual([
      '内部部门',
      '外协单位',
    ]);
  });
});
