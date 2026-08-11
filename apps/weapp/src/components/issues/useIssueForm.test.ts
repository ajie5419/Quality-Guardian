import { describe, expect, it } from 'vitest';

import {
  createIssueFormStateFromRecord,
  resolveCanonicalIssueResponsibility,
} from './useIssueForm';

describe('mobile issue form edit state', () => {
  it('replays every editable field from an existing issue and keeps canonical external responsibility', () => {
    const state = createIssueFormStateFromRecord(
      {
        claim: 'Yes',
        defectCategoryId: 'category-1',
        defectSubcategoryId: 'subcategory-1',
        defectSubtype: 'Weld crack',
        defectType: 'Welding',
        description: 'Crack found',
        division: 'Division A',
        inspector: 'Inspector A',
        lossAmount: 123.45,
        partName: 'Part A',
        photos: ['photo-a'],
        processName: 'Weld',
        projectName: 'Project A',
        quantity: 3,
        reportDate: '2026-08-11',
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartmentId: 'dept-production',
        responsibleWelder: 'Welder A',
        rootCause: 'Fixture drift',
        severity: 'Major',
        solution: 'Replace fixture',
        status: 'IN_PROGRESS',
        supplierId: 'supplier-a',
        workOrderNumber: 'WO-001',
      } as never,
      'Current inspector',
    );

    expect(state).toMatchObject({
      claim: 'Yes',
      defectCategoryId: 'category-1',
      defectSubcategoryId: 'subcategory-1',
      defectSubtype: 'Weld crack',
      defectType: 'Welding',
      description: 'Crack found',
      division: 'Division A',
      inspector: 'Inspector A',
      lossAmount: 123.45,
      partName: 'Part A',
      photos: ['photo-a'],
      processName: 'Weld',
      projectName: 'Project A',
      quantity: 3,
      reportDate: '2026-08-11',
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: 'dept-production',
      responsibleWelder: 'Welder A',
      rootCause: 'Fixture drift',
      severity: 'Major',
      solution: 'Replace fixture',
      status: 'IN_PROGRESS',
      supplierId: 'supplier-a',
      workOrderNumber: 'WO-001',
    });
  });

  it('does not convert legacy responsibility display snapshots into a new write payload', () => {
    const state = createIssueFormStateFromRecord({
      responsibilityType: null,
      responsibleDepartment: '采购部',
      supplierId: 'supplier-a',
      supplierName: 'Supplier A',
    } as never);

    expect(state.responsibleDepartmentId).toBe('');
    expect(state.supplierId).toBe('');
    expect(
      resolveCanonicalIssueResponsibility({
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: { value: 'dept-purchase' },
        supplierId: 'supplier-a',
      } as never),
    ).toBeNull();
  });
});
