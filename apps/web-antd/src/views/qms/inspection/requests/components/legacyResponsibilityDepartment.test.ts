import { describe, expect, it } from 'vitest';

import { resolveLegacyExternalResponsibilityDepartment } from './legacyResponsibilityDepartment';

const departments = [
  { label: '下料 BU', value: 'dept-cutting' },
  { label: '采购部', value: 'dept-purchase' },
  { label: '生产 OBU', value: 'dept-obu-1' },
  { label: '制造 SOBU', value: 'dept-manufacturing' },
];

describe('resolveLegacyExternalResponsibilityDepartment', () => {
  it('prefills the unique policy department for SUPPLIER', () => {
    expect(
      resolveLegacyExternalResponsibilityDepartment({
        departments,
        responsibilityType: 'SUPPLIER',
      }),
    ).toEqual({
      department: { label: '采购部', value: 'dept-purchase' },
      error: '',
    });
  });

  it('prefills the unique policy department for OUTSOURCING_UNIT', () => {
    expect(
      resolveLegacyExternalResponsibilityDepartment({
        departments,
        responsibilityType: 'OUTSOURCING_UNIT',
      }),
    ).toEqual({
      department: { label: '生产 OBU', value: 'dept-obu-1' },
      error: '',
    });
  });

  it('blocks when the policy department is missing', () => {
    const result = resolveLegacyExternalResponsibilityDepartment({
      departments: [
        { label: '下料 BU', value: 'dept-cutting' },
        { label: '制造 SOBU', value: 'dept-manufacturing' },
      ],
      responsibilityType: 'SUPPLIER',
    });
    expect(result.department).toBeNull();
    expect(result.error).toContain('采购部');
  });

  it('blocks when duplicate policy departments exist', () => {
    const result = resolveLegacyExternalResponsibilityDepartment({
      departments: [...departments, { label: '生产 OBU', value: 'dept-obu-2' }],
      responsibilityType: 'OUTSOURCING_UNIT',
    });
    expect(result.department).toBeNull();
    expect(result.error).toContain('多个有效部门');
  });
});
