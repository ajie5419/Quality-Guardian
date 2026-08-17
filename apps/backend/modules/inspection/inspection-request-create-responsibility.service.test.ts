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

function processTx(departmentId: null | string = 'dept-production') {
  return {
    processes: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'process-1',
        name: '外购件',
        responsibleDepartmentId: departmentId,
      }),
    },
  } as never;
}

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
      {} as never,
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

  it('resolves the INCOMING outsourcing department from the process default when its supplier category matches', async () => {
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
          processId: 'process-1',
          v2Responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-outsourcing',
          },
        },
        processTx(),
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-outsourcing',
      teamId: null,
    });
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      expect.any(Object),
    );
  });

  it('resolves the INCOMING supplier department from the process default', async () => {
    vi.mocked(resolveInspectionIssueResponsibility).mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: 'Purchasing',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierCategory: SUPPLIER_CATEGORY.SUPPLIER,
      supplierName: 'Supplier A',
    });
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
          processId: 'process-1',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
            supplierId: 'supplier-1',
          },
        },
        processTx('dept-purchasing'),
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-1',
      teamId: null,
    });
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleDepartmentId: 'dept-purchasing',
      }),
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
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
    });
    expect(resolveInspectionIssueResponsibility).not.toHaveBeenCalled();
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'accepts a client-selected outsourcing department for %s',
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
          {} as never,
        ),
      ).resolves.toBeDefined();
      expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
        expect.objectContaining({ responsibleDepartmentId: 'dept-client' }),
        expect.any(Object),
      );
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
          processId: 'process-1',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
            supplierId: 'supplier-outsourcing',
          },
        },
        processTx(),
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_INSPECTION_REQUEST_RESPONSIBILITY',
    });
  });

  it('resolves the hidden PROCESS outsourcing department from the process default', async () => {
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
      resolveV2RequestResponsibility(
        {
          category: 'PROCESS',
          processId: 'process-1',
          v2Responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-outsourcing',
          },
        },
        processTx(),
      ),
    ).resolves.toMatchObject({
      supplierId: 'supplier-outsourcing',
      team: '',
      teamId: null,
    });
    expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      expect.any(Object),
    );
  });

  it('rejects when the process has no configured responsible department', async () => {
    await expect(
      resolveV2RequestResponsibility(
        {
          category: 'INCOMING',
          processId: 'process-1',
          v2Responsibility: {
            responsibilityType: 'SUPPLIER',
            supplierId: 'supplier-1',
          },
        },
        processTx(null),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(resolveInspectionIssueResponsibility).not.toHaveBeenCalled();
  });
});
