import { describe, expect, it } from 'vitest';

import {
  buildRequestCreateResponsibilityPayload,
  getRequestCreateResponsibilityLabels,
  getRequestCreateResponsibilityTypes,
  isCurrentResponsibilityOptionsRequest,
  isRequestCreateExternalResponsibility,
  REQUEST_CREATE_RESPONSIBILITY_LABELS,
  REQUEST_CREATE_RESPONSIBILITY_TYPES,
} from './create-responsibility';

describe('request create responsibility payload', () => {
  it('uses category-specific responsibility choices', () => {
    expect(getRequestCreateResponsibilityTypes('PROCESS')).toEqual([
      'INTERNAL_DEPARTMENT',
      'OUTSOURCING_UNIT',
    ]);
    expect(getRequestCreateResponsibilityLabels('PROCESS')).toEqual([
      '内部部门',
      '外协单位',
    ]);
    expect(getRequestCreateResponsibilityTypes('INCOMING')).toEqual([
      'SUPPLIER',
      'OUTSOURCING_UNIT',
    ]);
  });

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
      },
      {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
      },
    ],
    [
      {
        responsibilityType: 'SUPPLIER' as const,
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-a',
      },
      {
        responsibilityType: 'SUPPLIER',
        supplierId: 'supplier-a',
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
      }),
    ).toBeNull();
  });

  it('uses an internal department without a TEAM identity', () => {
    expect(
      buildRequestCreateResponsibilityPayload({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-machining',
        supplierId: '',
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-machining',
    });
  });

  it.each(['SUPPLIER', 'OUTSOURCING_UNIT'] as const)(
    'submits %s without a hidden department ID',
    (responsibilityType) => {
      expect(
        buildRequestCreateResponsibilityPayload({
          responsibilityType,
          responsibleDepartmentId: 'dept-stale',
          supplierId: 'supplier-outsourcing',
        }),
      ).toEqual({
        responsibilityType,
        supplierId: 'supplier-outsourcing',
      });
      expect(isRequestCreateExternalResponsibility(responsibilityType)).toBe(
        true,
      );
    },
  );

  it('fails closed when outsourcing has no supplier', () => {
    expect(
      buildRequestCreateResponsibilityPayload({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: '',
        supplierId: '',
      }),
    ).toBeNull();
  });
});
