import {
  getInspectionRequestResponsibilitySupplierCategory,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  SUPPLIER_CATEGORY,
} from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierIdentityService } from '~/modules/supplier-identity';

import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { resolveV2RequestResponsibility } from './inspection-request-create-responsibility.service';
import { assertInspectionRequestResponsibilityPolicy } from './inspection-request-responsibility-policy.service';

const { resolveProcessOutsourcingResponsibleDepartmentId } = vi.hoisted(() => ({
  resolveProcessOutsourcingResponsibleDepartmentId: vi.fn(),
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: vi.fn(),
    resolveTeamById: vi.fn(),
  },
}));

vi.mock('./inspection-issue-responsibility.service', () => ({
  resolveInspectionIssueResponsibility: vi.fn(),
}));

vi.mock('./inspection-request-responsibility-policy.service', () => ({
  assertInspectionRequestResponsibilityPolicy: vi.fn(),
}));

vi.mock('./inspection-request-responsibility-default.service', () => ({
  resolveProcessOutsourcingResponsibleDepartmentId,
}));

describe('resolveV2RequestResponsibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierCategory: null,
      supplierName: null,
    });
    resolveProcessOutsourcingResponsibleDepartmentId.mockResolvedValue(
      'dept-production',
    );
  });

  it('accepts direct internal responsibility without an execution TEAM', async () => {
    const result = await resolveV2RequestResponsibility(
      {
        category: 'PROCESS',
        v2Responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
          supplierId: '',
        },
      },
      {} as any,
    );

    expect(result).toMatchObject({
      supplierId: null,
      team: '',
      teamId: null,
    });
    expect(SupplierIdentityService.resolveTeamById).not.toHaveBeenCalled();
    expect(assertInspectionRequestResponsibilityPolicy).toHaveBeenCalledWith({
      client: expect.any(Object),
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-machining',
      teamId: undefined,
    });
  });

  it('allows INCOMING external responsibility when its supplier category matches', async () => {
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValueOnce({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-outsourcing',
      supplierCategory: SUPPLIER_CATEGORY.OUTSOURCING,
      supplierName: 'Outsourcing Supplier',
    });
    vi.mocked(
      SupplierIdentityService.resolveSupplierById,
    ).mockResolvedValueOnce({
      category: SUPPLIER_CATEGORY.OUTSOURCING,
      id: 'supplier-outsourcing',
      name: 'Outsourcing Supplier',
    });

    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'INCOMING',
          v2Responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            responsibleDepartmentId: 'dept-production',
            supplierId: 'supplier-outsourcing',
          },
        },
        {} as any,
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-outsourcing',
      teamId: null,
    });
  });

  it('rejects an external supplier whose category does not match the selected type', async () => {
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: 'Quality Department',
      responsibleDepartmentId: 'dept-quality',
      supplierId: 'supplier-outsourcing',
      supplierCategory: SUPPLIER_CATEGORY.OUTSOURCING,
      supplierName: 'Outsourcing Supplier',
    });
    vi.mocked(
      SupplierIdentityService.resolveSupplierById,
    ).mockResolvedValueOnce({
      category: SUPPLIER_CATEGORY.OUTSOURCING,
      id: 'supplier-outsourcing',
      name: 'Outsourcing Supplier',
    });

    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'PROCESS',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
            responsibleDepartmentId: 'dept-quality',
            supplierId: 'supplier-outsourcing',
          },
        },
        {} as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
    });
  });

  it('server-resolves the hidden PROCESS outsourcing department before creating R', async () => {
    expect(
      getInspectionRequestResponsibilitySupplierCategory('OUTSOURCING_UNIT'),
    ).toBe(SUPPLIER_CATEGORY.OUTSOURCING);
    vi.mocked(resolveInspectionIssueResponsibility)
      .mockReset()
      .mockResolvedValue({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-outsourcing',
        supplierCategory: SUPPLIER_CATEGORY.OUTSOURCING,
        supplierName: 'Outsourcing Unit A',
      });
    vi.mocked(SupplierIdentityService.resolveSupplierById)
      .mockReset()
      .mockResolvedValue({
        category: SUPPLIER_CATEGORY.OUTSOURCING,
        id: 'supplier-outsourcing',
        name: 'Outsourcing Unit A',
      });
    await expect(
      SupplierIdentityService.resolveSupplierById(
        'supplier-outsourcing',
        {} as any,
      ),
    ).resolves.toMatchObject({ category: SUPPLIER_CATEGORY.OUTSOURCING });

    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'PROCESS',
          v2Responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-outsourcing',
          },
        },
        {} as any,
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-outsourcing',
      team: '',
      teamId: null,
    });
    expect(resolveProcessOutsourcingResponsibleDepartmentId).toHaveBeenCalled();
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      expect.any(Object),
    );
  });
});
