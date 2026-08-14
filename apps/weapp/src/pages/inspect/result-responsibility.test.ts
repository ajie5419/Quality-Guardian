import { describe, expect, it } from 'vitest';

import {
  hasEmptyInspectionRequestIssueResponsibilityContext,
  resolveLockedInspectionRequestIssueResponsibility,
} from './result-responsibility';

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

  it('rejects an internal context with a stale supplier ID so the close flow can repair it', () => {
    expect(
      resolveLockedInspectionRequestIssueResponsibility({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-quality',
        supplierId: 'supplier-stale',
      }),
    ).toBeNull();
  });

  it('treats an all-empty top-level triad as eligible for close-time selection', () => {
    expect(
      hasEmptyInspectionRequestIssueResponsibilityContext({
        issueResponsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: null,
        },
        responsibleDepartmentId: null,
        responsibleDepartment: null,
        responsibilityType: null,
      }),
    ).toBe(true);
  });

  it('does not treat a legacy supplier display value as a persisted responsibility fact', () => {
    expect(
      hasEmptyInspectionRequestIssueResponsibilityContext({
        supplierId: 'legacy-supplier-only',
        responsibleDepartmentId: null,
        responsibilityType: 'OUTSOURCING_UNIT',
      }),
    ).toBe(false);
    expect(
      hasEmptyInspectionRequestIssueResponsibilityContext({
        supplierId: 'legacy-supplier-only',
        responsibleDepartmentId: null,
        responsibilityType: null,
      }),
    ).toBe(true);
  });
});
