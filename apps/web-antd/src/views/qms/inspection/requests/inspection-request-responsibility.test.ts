import { INSPECTION_ISSUE_RESPONSIBILITY_TYPE } from '@qgs/shared';
import { describe, expect, it } from 'vitest';

import {
  resolveLinkedIssueResponsibilitySelection,
  resolveResponsibilityTypeFromDepartment,
  resolveTreeDepartmentIdentity,
} from './inspection-request-responsibility';

const departments = [
  {
    children: [
      { title: '采购部', value: 'dept-purchase' },
      { title: '生产 OBU', value: 'dept-production' },
      { title: '结构 BU1', value: 'dept-structure' },
    ],
    title: 'Company',
    value: 'company',
  },
];

describe('inspection request responsibility', () => {
  it('resolves a TreeSelect ID to its canonical department name', () => {
    expect(
      resolveTreeDepartmentIdentity(departments, {
        department: 'Legacy name',
        departmentId: 'dept-structure',
      }),
    ).toEqual({ id: 'dept-structure', name: '结构 BU1' });
  });

  it('resolves a legacy department name to its TreeSelect ID', () => {
    expect(
      resolveTreeDepartmentIdentity(departments, {
        department: '采购部',
      }),
    ).toEqual({ id: 'dept-purchase', name: '采购部' });
  });

  it.each([
    ['采购部', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER],
    ['生产 OBU', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT],
    ['生产管理部', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT],
    ['外协质量组', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT],
    ['结构 BU1', INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT],
  ])('classifies %s as %s', (department, expected) => {
    expect(
      resolveResponsibilityTypeFromDepartment(
        department,
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      ),
    ).toBe(expected);
  });

  it('preserves the selected supplier identity for an external unit', () => {
    expect(
      resolveLinkedIssueResponsibilitySelection(departments, {
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-1',
        supplierName: 'Outsourcing Plant A',
      }),
    ).toEqual({
      responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-1',
      supplierName: 'Outsourcing Plant A',
    });
  });

  it('clears stale supplier identity when an internal department is selected', () => {
    expect(
      resolveLinkedIssueResponsibilitySelection(departments, {
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
        responsibleDepartmentId: 'dept-structure',
        supplierId: 'stale-supplier',
        supplierName: 'Stale Supplier',
      }),
    ).toEqual({
      responsibilityType:
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
      responsibleDepartment: '结构 BU1',
      responsibleDepartmentId: 'dept-structure',
      supplierId: '',
      supplierName: '',
    });
  });

  it('keeps the explicit external type when another department is selected', () => {
    expect(
      resolveLinkedIssueResponsibilitySelection(departments, {
        responsibilityType:
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
        responsibleDepartmentId: 'dept-structure',
        supplierId: 'supplier-1',
        supplierName: 'Outsourcing Plant A',
      }),
    ).toEqual({
      responsibilityType: INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      responsibleDepartment: '结构 BU1',
      responsibleDepartmentId: 'dept-structure',
      supplierId: 'supplier-1',
      supplierName: 'Outsourcing Plant A',
    });
  });
});
