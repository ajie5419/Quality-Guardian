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

const { resolveInspectionRequestResponsibilityDepartmentId } = vi.hoisted(
  () => ({
    resolveInspectionRequestResponsibilityDepartmentId: vi.fn(),
  }),
);

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
  resolveInspectionRequestResponsibilityDepartmentId,
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
    resolveInspectionRequestResponsibilityDepartmentId.mockResolvedValue(
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

  it('server-resolves the INCOMING outsourcing department when its supplier category matches', async () => {
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
            supplierId: 'supplier-outsourcing',
          },
        },
        {} as any,
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-outsourcing',
      teamId: null,
    });
    expect(
      resolveInspectionRequestResponsibilityDepartmentId,
    ).toHaveBeenCalledWith('OUTSOURCING_UNIT', expect.any(Object));
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      expect.any(Object),
    );
  });

  it('server-resolves the INCOMING supplier department before creating R', async () => {
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: 'Purchasing',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierCategory: SUPPLIER_CATEGORY.SUPPLIER,
      supplierName: 'Supplier A',
    });
    resolveInspectionRequestResponsibilityDepartmentId.mockResolvedValueOnce(
      'dept-purchasing',
    );
    vi.mocked(
      SupplierIdentityService.resolveSupplierById,
    ).mockResolvedValueOnce({
      category: SUPPLIER_CATEGORY.SUPPLIER,
      id: 'supplier-1',
      name: 'Supplier A',
    });

    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'INCOMING',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
            supplierId: 'supplier-1',
          },
        },
        {} as any,
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-1',
      teamId: null,
    });
    expect(
      resolveInspectionRequestResponsibilityDepartmentId,
    ).toHaveBeenCalledWith('SUPPLIER', expect.any(Object));
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-purchasing' }),
      expect.any(Object),
    );
  });

  it('rejects INCOMING internal responsibility before resolving any department', async () => {
    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'INCOMING',
          v2Responsibility: {
            responsibilityType: 'INTERNAL_DEPARTMENT',
            responsibleDepartmentId: 'dept-client',
            supplierId: '',
          },
        },
        {} as any,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
    });
    expect(
      resolveInspectionRequestResponsibilityDepartmentId,
    ).not.toHaveBeenCalled();
    expect(resolveInspectionIssueResponsibility).not.toHaveBeenCalled();
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'rejects a client-selected outsourcing department for %s',
    async (category) => {
      await expect(
        resolveV2RequestResponsibility(
          {
            category,
            v2Responsibility: {
              responsibilityType: 'OUTSOURCING_UNIT',
              responsibleDepartmentId: 'dept-client',
              supplierId: 'supplier-outsourcing',
            },
          },
          {} as any,
        ),
      ).rejects.toMatchObject({
        code: 'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
      });
      expect(
        resolveInspectionRequestResponsibilityDepartmentId,
      ).not.toHaveBeenCalled();
      expect(resolveInspectionIssueResponsibility).not.toHaveBeenCalled();
    },
  );

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
          category: 'INCOMING',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
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
    expect(
      resolveInspectionRequestResponsibilityDepartmentId,
    ).toHaveBeenCalledWith('OUTSOURCING_UNIT', expect.any(Object));
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      expect.any(Object),
    );
  });
});
