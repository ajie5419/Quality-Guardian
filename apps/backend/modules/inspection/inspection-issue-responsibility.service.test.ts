import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { SupplierIdentityService } from '~/modules/supplier-identity';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveById: vi.fn() },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveSupplierById: vi.fn() },
}));

describe('inspection issue responsibility resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-machining',
      name: 'Machining BU',
    });
  });

  it('resolves an internal department without importing issue creation', async () => {
    await expect(
      resolveInspectionIssueResponsibility(
        {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
        },
        {} as any,
      ),
    ).resolves.toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierName: null,
    });
    expect(SupplierIdentityService.resolveSupplierById).not.toHaveBeenCalled();
  });

  it('resolves an external supplier from its canonical ID', async () => {
    vi.mocked(SupplierIdentityService.resolveSupplierById).mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    });

    await expect(
      resolveInspectionIssueResponsibility(
        {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-machining',
          supplierId: 'supplier-1',
        },
        {} as any,
      ),
    ).resolves.toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });
});
