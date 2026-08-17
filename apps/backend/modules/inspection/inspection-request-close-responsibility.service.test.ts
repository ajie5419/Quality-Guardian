import type { Prisma } from '@prisma/client';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertCloseLinkedIssueResponsibilityMatches,
  buildCloseInspectionResponsibilityWrite,
  resolveLegacyCloseRequestResponsibility,
} from './inspection-request-close-responsibility.service';

const mocks = vi.hoisted(() => ({
  assertPolicy: vi.fn(),
  resolveResponsibility: vi.fn(),
  resolveSupplierById: vi.fn(),
}));

vi.mock('./inspection-issue-responsibility.service', () => ({
  resolveInspectionIssueResponsibility: mocks.resolveResponsibility,
}));
vi.mock('./inspection-request-responsibility-policy.service', () => ({
  assertInspectionRequestResponsibilityPolicy: mocks.assertPolicy,
}));
vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: mocks.resolveSupplierById,
  },
}));
vi.mock('./inspection-request-close.schema', () => ({
  failCloseRequest: (code: string, message: string) => {
    throw Object.assign(new Error(message), { code });
  },
}));

const baseRequest = { id: 'request-1', teamId: 'team-1' };
const linkedIssue = {
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartmentId: 'dept-assembly',
};

describe('legacy inspection request close responsibility', () => {
  const updateMany = vi.fn();
  const tx = {
    qms_inspection_requests: { updateMany },
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    mocks.resolveSupplierById.mockResolvedValue({
      category: 'Outsourcing',
      id: 'supplier-before-close',
      name: 'Supplier A',
    });
    mocks.resolveResponsibility.mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: '装配部',
      responsibleDepartmentId: 'dept-assembly',
      supplierId: null,
      supplierCategory: null,
      supplierName: null,
    });
  });

  it('persists a fully resolved legacy close responsibility with a CAS guard', async () => {
    const result = await resolveLegacyCloseRequestResponsibility({
      responsibility: linkedIssue,
      request: { ...baseRequest, category: 'INCOMING' },
      tx,
    });

    expect(result.resolvedLegacy).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        }),
        where: expect.objectContaining({
          category: 'INCOMING',
          isDeleted: false,
          responsibilityType: null,
          responsibleDepartment: null,
          responsibleDepartmentId: null,
          supplierId: null,
          supplierName: null,
          teamId: 'team-1',
        }),
      }),
    );
  });

  it('completes a historical dispatched request with a compatible partial fact', async () => {
    const result = await resolveLegacyCloseRequestResponsibility({
      responsibility: linkedIssue,
      request: {
        ...baseRequest,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        status: 'DISPATCHED',
      },
      tx,
    });

    expect(result.resolvedLegacy).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: '装配部',
          responsibleDepartmentId: 'dept-assembly',
        }),
        where: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: null,
          responsibleDepartmentId: null,
          supplierId: null,
          supplierName: null,
        }),
      }),
    );
  });

  it('rejects a partial fact that conflicts with the submitted canonical responsibility', async () => {
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: linkedIssue,
        request: {
          ...baseRequest,
          responsibleDepartmentId: 'dept-other',
        },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('completes a legacy responsibility for PASS from the top-level input', async () => {
    const result = await resolveLegacyCloseRequestResponsibility({
      responsibility: linkedIssue,
      request: baseRequest,
      tx,
    });

    expect(result).toMatchObject({
      request: expect.objectContaining({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
      }),
      resolvedLegacy: true,
    });
  });

  it('blocks a close when a legacy request has no responsibility input', async () => {
    await expect(
      resolveLegacyCloseRequestResponsibility({ request: baseRequest, tx }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a top-level override that conflicts with a complete request fact', async () => {
    mocks.resolveResponsibility
      .mockResolvedValueOnce({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: '机加部',
        responsibleDepartmentId: 'dept-machining',
        supplierId: null,
        supplierCategory: null,
        supplierName: null,
      })
      .mockResolvedValueOnce({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: '装配部',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: null,
        supplierCategory: null,
        supplierName: null,
      });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
        },
        request: {
          ...baseRequest,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: '装配部',
          responsibleDepartmentId: 'dept-assembly',
        },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent responsibility write', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: linkedIssue,
        request: baseRequest,
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a concurrent supplier identity change without writing the triad', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-before-close',
      supplierCategory: 'Outsourcing',
      supplierName: 'Supplier A',
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-before-close',
        },
        request: {
          ...baseRequest,
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-before-close',
        },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'supplier-before-close',
        }),
      }),
    );
    expect(mocks.resolveResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
      tx,
    );
  });

  it('rejects supplier responsibility for a PROCESS request during close', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchase',
      supplierId: 'supplier-before-close',
      supplierCategory: 'Supplier',
      supplierName: 'Supplier A',
    });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-before-close',
        },
        request: { ...baseRequest, category: 'PROCESS' },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not apply PROCESS restrictions when a historical category is null', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchase',
      supplierId: 'supplier-before-close',
      supplierCategory: 'Supplier',
      supplierName: 'Supplier A',
    });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-before-close',
        },
        request: { ...baseRequest, category: null },
        tx,
      }),
    ).resolves.toMatchObject({
      request: expect.objectContaining({ responsibilityType: 'SUPPLIER' }),
    });
  });

  it('rejects a complete PROCESS supplier fact before a PASS close can reuse it', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchase',
      supplierId: 'supplier-before-close',
      supplierCategory: 'Supplier',
      supplierName: 'Supplier A',
    });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        request: {
          ...baseRequest,
          category: 'PROCESS',
          responsibilityType: 'SUPPLIER',
          responsibleDepartment: '采购部',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-before-close',
          supplierName: 'Supplier A',
        },
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refreshes a legacy responsibility name snapshot when canonical IDs agree', async () => {
    const result = await resolveLegacyCloseRequestResponsibility({
      request: {
        ...baseRequest,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: '旧装配部',
        responsibleDepartmentId: 'dept-assembly',
      },
      tx,
    });

    expect(result).toMatchObject({
      request: expect.objectContaining({ responsibleDepartment: '装配部' }),
      resolvedLegacy: true,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ responsibleDepartment: '装配部' }),
        where: expect.objectContaining({
          responsibleDepartment: '旧装配部',
        }),
      }),
    );
  });

  it('rejects a supplier whose category does not match the close responsibility', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-before-close',
      supplierCategory: 'Supplier',
      supplierName: 'Supplier A',
    });
    mocks.resolveSupplierById.mockResolvedValueOnce({
      category: 'Supplier',
      id: 'supplier-before-close',
      name: 'Supplier A',
    });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-before-close',
        },
        request: baseRequest,
        tx,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(mocks.resolveSupplierById).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it.each(['INCOMING', 'PROCESS'] as const)(
    'inherits the historical %s outsourcing responsibility department from the request snapshot',
    async (category) => {
      mocks.resolveResponsibility.mockResolvedValueOnce({
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: '生产 OBU',
        responsibleDepartmentId: 'dept-production',
        supplierId: 'supplier-outsourcing',
        supplierCategory: 'Outsourcing',
        supplierName: 'Outsourcing Unit A',
      });

      await expect(
        resolveLegacyCloseRequestResponsibility({
          responsibility: {
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierId: 'supplier-outsourcing',
          },
          request: {
            ...baseRequest,
            category,
            responsibleDepartmentId: 'dept-production',
          },
          tx,
        }),
      ).resolves.toMatchObject({
        request: expect.objectContaining({
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-production',
        }),
      });
      expect(mocks.resolveResponsibility).toHaveBeenCalledWith(
        expect.objectContaining({ responsibleDepartmentId: 'dept-production' }),
        tx,
      );
      expect(mocks.assertPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          responsibleDepartmentId: 'dept-production',
          teamId: null,
        }),
      );
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsibilityType: 'OUTSOURCING_UNIT',
            responsibleDepartmentId: 'dept-production',
          }),
          where: expect.objectContaining({
            category,
            responsibilityType: null,
            responsibleDepartmentId: 'dept-production',
          }),
        }),
      );
    },
  );

  it('inherits the INCOMING supplier responsibility department from the request snapshot', async () => {
    mocks.resolveResponsibility.mockResolvedValueOnce({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: 'Purchasing',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierCategory: 'Supplier',
      supplierName: 'Supplier A',
    });

    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'SUPPLIER',
          supplierId: 'supplier-1',
        },
        request: {
          ...baseRequest,
          category: 'INCOMING',
          responsibleDepartmentId: 'dept-purchasing',
        },
        tx,
      }),
    ).resolves.toMatchObject({
      request: expect.objectContaining({
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
      }),
    });
    expect(mocks.resolveResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-purchasing' }),
      tx,
    );
  });

  it('accepts a client-selected incoming supplier department during close', async () => {
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-client',
          supplierId: 'supplier-1',
        },
        request: { ...baseRequest, category: 'INCOMING' },
        tx,
      }),
    ).resolves.toBeDefined();
    expect(mocks.resolveResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-client' }),
      tx,
    );
  });

  it('accepts a client-selected outsourcing department during close', async () => {
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-client',
          supplierId: 'supplier-outsourcing',
        },
        request: baseRequest,
        tx,
      }),
    ).resolves.toBeDefined();
    expect(mocks.resolveResponsibility).toHaveBeenCalledWith(
      expect.objectContaining({ responsibleDepartmentId: 'dept-client' }),
      tx,
    );
  });

  it('does not update a soft-deleted request', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      resolveLegacyCloseRequestResponsibility({
        responsibility: linkedIssue,
        request: baseRequest,
        tx,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
  });

  it('rejects a FAIL issue whose responsibility differs from the close responsibility', () => {
    expect(() =>
      assertCloseLinkedIssueResponsibilityMatches({
        linkedIssue: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-machining',
        },
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: '装配部',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: null,
          supplierName: null,
        },
      }),
    ).toThrow('不合格项责任归属必须与关闭责任归属一致');
  });

  it('projects request snapshots to an inspection with no responsibility fact', () => {
    expect(
      buildCloseInspectionResponsibilityWrite({
        inspection: { supplierId: null },
        request: {
          ...baseRequest,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: '装配部',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: null,
          supplierName: null,
        },
      }),
    ).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: '装配部',
      responsibleDepartmentId: 'dept-assembly',
      supplierId: null,
      supplierName: null,
    });
  });

  it('rejects a partial or conflicting existing inspection identity', () => {
    const request = {
      ...baseRequest,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: '装配部',
      responsibleDepartmentId: 'dept-assembly',
      supplierId: null,
      supplierName: null,
    };
    expect(() =>
      buildCloseInspectionResponsibilityWrite({
        inspection: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-other',
          supplierId: null,
        },
        request,
      }),
    ).toThrow('关联检验记录责任事实与报检任务不一致');
  });
});
