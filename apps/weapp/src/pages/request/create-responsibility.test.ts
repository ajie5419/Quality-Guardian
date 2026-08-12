import { describe, expect, it } from 'vitest';

import {
  buildRequestCreateResponsibilityPayload,
  isCurrentResponsibilityOptionsRequest,
  REQUEST_CREATE_RESPONSIBILITY_LABELS,
  REQUEST_CREATE_RESPONSIBILITY_TYPES,
} from './create-responsibility';

describe('request create responsibility payload', () => {
  it('keeps all three responsibility types available for both request routes', () => {
    expect(REQUEST_CREATE_RESPONSIBILITY_TYPES).toEqual([
      'INTERNAL_DEPARTMENT',
      'SUPPLIER',
      'OUTSOURCING_UNIT',
    ]);
    expect(REQUEST_CREATE_RESPONSIBILITY_LABELS).toEqual([
      '内部部门',
      '供应商',
      '外协单位',
    ]);
  });

  it('ignores stale responsibility options after a type change', () => {
    expect(
      isCurrentResponsibilityOptionsRequest({
        currentResponsibilityType: 'OUTSOURCING_UNIT',
        currentSequence: 2,
        requestedResponsibilityType: 'INTERNAL_DEPARTMENT',
        requestedSequence: 1,
      }),
    ).toBe(false);
    expect(
      isCurrentResponsibilityOptionsRequest({
        currentResponsibilityType: 'OUTSOURCING_UNIT',
        currentSequence: 2,
        requestedResponsibilityType: 'OUTSOURCING_UNIT',
        requestedSequence: 2,
      }),
    ).toBe(true);
  });

  it.each([
    [
      {
        responsibilityType: 'INTERNAL_DEPARTMENT' as const,
        responsibleDepartmentId: 'dept-assembly',
        supplierId: 'supplier-stale',
        teamId: 'team-assembly',
        teamResponsibleDepartmentId: 'dept-assembly',
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

  it('allows a department without a TEAM and rejects a mismatched selected TEAM', () => {
    expect(
      buildRequestCreateResponsibilityPayload({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
        supplierId: '',
        teamId: '',
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-machining',
    });
    expect(
      buildRequestCreateResponsibilityPayload({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
        supplierId: '',
        teamId: 'team-structure',
        teamResponsibleDepartmentId: 'dept-structure',
      }),
    ).toBeNull();
  });
});
