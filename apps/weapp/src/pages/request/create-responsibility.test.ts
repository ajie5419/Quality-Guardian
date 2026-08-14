import { describe, expect, it } from 'vitest';

import {
  buildRequestCreateResponsibilityPayload,
  getRequestCreateResponsibilityLabels,
  getRequestCreateResponsibilityTypes,
  isCurrentResponsibilityOptionsRequest,
  isRequestCreateOutsourcingResponsibility,
  REQUEST_CREATE_RESPONSIBILITY_LABELS,
  REQUEST_CREATE_RESPONSIBILITY_TYPES,
  resolveRequestCreateResponsibilityDepartmentDefault,
} from './create-responsibility';

describe('request create responsibility payload', () => {
  it('removes supplier responsibility from PROCESS while preserving INCOMING choices', () => {
    expect(getRequestCreateResponsibilityTypes('PROCESS')).toEqual([
      'INTERNAL_DEPARTMENT',
      'OUTSOURCING_UNIT',
    ]);
    expect(getRequestCreateResponsibilityLabels('PROCESS')).toEqual([
      '内部部门',
      '外协单位',
    ]);
    expect(getRequestCreateResponsibilityTypes('INCOMING')).toEqual([
      'INTERNAL_DEPARTMENT',
      'SUPPLIER',
      'OUTSOURCING_UNIT',
    ]);
  });

  it.each([
    [
      'SUPPLIER' as const,
      [{ label: '采购部', value: 'dept-purchasing' }],
      'dept-purchasing',
    ],
  ])(
    'uses the shared canonical default for %s',
    (responsibilityType, departments, expected) => {
      expect(
        resolveRequestCreateResponsibilityDepartmentDefault({
          currentResponsibleDepartmentId: '',
          departments,
          responsibilityType,
        }),
      ).toBe(expected);
    },
  );

  it('never defaults a department for outsourcing responsibility', () => {
    expect(
      resolveRequestCreateResponsibilityDepartmentDefault({
        currentResponsibleDepartmentId: '',
        departments: [{ label: '生产 OBU', value: 'dept-production' }],
        responsibilityType: 'OUTSOURCING_UNIT',
      }),
    ).toBe('');
  });

  it('does not replace a manually selected department', () => {
    expect(
      resolveRequestCreateResponsibilityDepartmentDefault({
        currentResponsibleDepartmentId: 'dept-manual',
        departments: [{ label: '采购部', value: 'dept-purchasing' }],
        responsibilityType: 'SUPPLIER',
      }),
    ).toBe('dept-manual');
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
        responsibleDepartmentId: 'dept-purchasing',
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

  it.each(['INCOMING', 'PROCESS'] as const)(
    'submits %s outsourcing without a hidden department ID',
    (_category) => {
      expect(
        buildRequestCreateResponsibilityPayload({
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-stale',
          supplierId: 'supplier-outsourcing',
        }),
      ).toEqual({
        responsibilityType: 'OUTSOURCING_UNIT',
        supplierId: 'supplier-outsourcing',
      });
      expect(isRequestCreateOutsourcingResponsibility('OUTSOURCING_UNIT')).toBe(
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
