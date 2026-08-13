import type { Prisma } from '@prisma/client';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCloseLinkedIssueCreateResult } from '~/modules/inspection/inspection-request-close-issue.service';

const tx = {
  quality_records: {
    update: vi.fn().mockImplementation(({ data, where }) => ({
      ...data,
      id: where.id,
    })),
  },
} as unknown as Prisma.TransactionClient;
const mocks = vi.hoisted(() => ({
  createInTransaction: vi.fn(),
  findInspectionForIssue: vi.fn(),
  resolveCanonicalNameById: vi.fn(),
  resolveCanonicalProcessName: vi.fn(),
  resolveSupplierById: vi.fn(),
  resolveSupplierByTeamId: vi.fn(),
  resolveRequestResponsibility: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  findInspectionForIssue: mocks.findInspectionForIssue,
}));
vi.mock('~/modules/inspection/inspection-issue-create.service', () => ({
  InspectionIssueCreateService: {
    createInTransaction: mocks.createInTransaction,
  },
}));
vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: mocks.resolveSupplierById,
    resolveSupplierByTeamId: mocks.resolveSupplierByTeamId,
  },
}));
vi.mock(
  '~/modules/inspection/inspection-request-responsibility.service',
  () => ({
    resolveInspectionRequestIssueResponsibilityInTransaction:
      mocks.resolveRequestResponsibility,
  }),
);
vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn((_table, fields) => fields),
}));
vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: mocks.resolveCanonicalProcessName,
}));
vi.mock('~/modules/inspection/inspection-request', () => ({
  normalizeInspectionRequestText: vi.fn((value) =>
    typeof value === 'string' ? value.trim() : '',
  ),
}));
vi.mock('~/modules/inspection/inspection-request-close.schema', () => ({
  failCloseRequest: (_code: string, message: string) => {
    throw new Error(message);
  },
  parseCloseRequestNumber: (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  },
}));

const request = {
  partName: 'Bearing',
  process: { name: 'Welding' },
  processName: 'Welding',
  reporter: 'Reporter A',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartment: 'Assembly',
  responsibleDepartmentId: 'dept-assembly',
  supplierId: null,
  supplierName: null,
  workOrderNumber: 'WO-1',
};
const linkedIssue = {
  defectCategoryId: 'cat-1',
  defectSubcategoryId: 'sub-1',
  description: 'defect',
  partName: 'Bearing',
  photos: ['/uploads/defect.jpg'],
  processName: 'Welding',
  quantity: 2,
  rootCause: 'cause',
  severity: 'Major',
  solution: 'repair',
  status: 'OPEN',
};

describe('buildCloseLinkedIssueCreateResult', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tx.quality_records.update).mockImplementation(
      ({ data, where }) =>
        ({
          ...data,
          id: where.id,
        }) as never,
    );
    mocks.findInspectionForIssue.mockResolvedValue({ id: 'inspection-1' });
    mocks.resolveRequestResponsibility.mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Assembly',
      responsibleDepartmentId: 'dept-assembly',
      supplierId: null,
      supplierName: '',
    });
    mocks.resolveCanonicalProcessName.mockReturnValue('Welding');
    mocks.resolveSupplierByTeamId.mockResolvedValue(null);
    mocks.resolveSupplierById.mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    });
    mocks.createInTransaction.mockResolvedValue({
      ncNumber: 'NC-26KJ-041',
      record: { id: 'issue-1', nonConformanceNumber: 'NC-26KJ-041' },
    });
  });

  it('delegates FAIL issue creation to the shared transaction service', async () => {
    const result = await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 2 },
      inspectionId: 'inspection-1',
      linkedIssue: {
        ...linkedIssue,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: 'dept-assembly',
      },
      request,
      tx,
      userinfo: { id: 'user-1', username: 'qc' } as never,
    });

    expect(mocks.createInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          inspectionId: 'inspection-1',
          responsibleDepartment: 'Assembly',
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: undefined,
          supplierName: undefined,
        }),
        tx,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        auditVariables: {
          issue: 'Bearing',
          nonConformanceNumber: 'NC-26KJ-041',
        },
        record: expect.objectContaining({ id: 'issue-1' }),
      }),
    );
    expect(tx.quality_records.update).toHaveBeenCalledWith({
      data: {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Assembly',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: null,
        supplierName: null,
      },
      where: { id: 'issue-1' },
    });
  });

  it('uses the request supplier identity for supplier responsibility', async () => {
    mocks.resolveRequestResponsibility.mockResolvedValue({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
    await buildCloseLinkedIssueCreateResult({
      body: { unqualifiedQuantity: 2 },
      inspectionId: 'inspection-1',
      linkedIssue: {
        ...linkedIssue,
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-1',
      },
      request: {
        ...request,
        responsibilityType: 'SUPPLIER',
        responsibleDepartment: '采购部',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
      },
      tx,
      userinfo: { id: 'user-1', username: 'qc' } as never,
    });

    expect(mocks.createInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          responsibleDepartment: '采购部',
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchasing',
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
        }),
      }),
    );
  });

  it('rejects an internal responsibility that carries a supplier ID', async () => {
    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 2 },
        inspectionId: 'inspection-1',
        linkedIssue: {
          ...linkedIssue,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
          supplierId: 'supplier-1',
        },
        request,
        tx,
        userinfo: { id: 'user-1', username: 'qc' } as never,
      }),
    ).rejects.toThrow('内部责任部门不能同时指定供应商 ID');
  });

  it('rejects a valid but non-canonical department ID from the client', async () => {
    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 2 },
        inspectionId: 'inspection-1',
        linkedIssue: {
          ...linkedIssue,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-other-active',
        },
        request,
        tx,
        userinfo: { id: 'user-1', username: 'qc' } as never,
      }),
    ).rejects.toThrow('责任部门 ID 与报检任务的 canonical 责任部门不一致');
  });

  it('rejects requests whose canonical department is missing or ambiguous', async () => {
    mocks.resolveRequestResponsibility.mockResolvedValue({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Assembly',
      responsibleDepartmentId: null,
      supplierId: null,
      supplierName: '',
    });
    await expect(
      buildCloseLinkedIssueCreateResult({
        body: { unqualifiedQuantity: 2 },
        inspectionId: 'inspection-1',
        linkedIssue: {
          ...linkedIssue,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        },
        request,
        tx,
        userinfo: { id: 'user-1', username: 'qc' } as never,
      }),
    ).rejects.toThrow('报检任务责任部门缺失或存在多个有效匹配');
  });
});
