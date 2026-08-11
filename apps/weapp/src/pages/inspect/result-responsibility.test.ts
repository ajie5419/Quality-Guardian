import { describe, expect, it } from 'vitest';

import { resolveLockedInspectionRequestIssueResponsibility } from './result-responsibility';

describe('mobile inspection result responsibility context', () => {
  it.each([
    ['INTERNAL_DEPARTMENT', 'dept-quality', undefined],
    ['SUPPLIER', 'dept-purchasing', 'supplier-1'],
    ['OUTSOURCING_UNIT', 'dept-production', 'supplier-2'],
  ] as const)(
    'locks the canonical %s context without names',
    (responsibilityType, responsibleDepartmentId, supplierId) => {
      expect(
        resolveLockedInspectionRequestIssueResponsibility({
          responsibilityType,
          responsibleDepartment: 'display-only',
          responsibleDepartmentId,
          supplierId,
          supplierName: 'display-only',
        }),
      ).toEqual({
        responsibilityType,
        responsibleDepartmentId,
        ...(supplierId ? { supplierId } : {}),
      });
    },
  );

  it('rejects missing and labelled department IDs instead of guessing by name', () => {
    expect(
      resolveLockedInspectionRequestIssueResponsibility({
        responsibilityType: 'SUPPLIER',
        responsibleDepartment: '采购部',
        supplierId: 'supplier-1',
      }),
    ).toBeNull();
    expect(
      resolveLockedInspectionRequestIssueResponsibility({
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: { label: '采购部', value: 'dept-purchasing' },
        supplierId: 'supplier-1',
      }),
    ).toBeNull();
  });

  it('rejects an external context without its canonical supplier ID', () => {
    expect(
      resolveLockedInspectionRequestIssueResponsibility({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        supplierName: '外协单位',
      }),
    ).toBeNull();
  });
});
