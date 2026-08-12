import type { Prisma } from '@prisma/client';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueCreateService } from '~/modules/inspection/inspection-issue-create.service';

const mocks = vi.hoisted(() => ({
  assertWelder: vi.fn(),
  buildCreateData: vi.fn(),
  enqueueScores: vi.fn(),
  findInspection: vi.fn(),
  getSerial: vi.fn(),
  resolveDepartment: vi.fn(),
  resolveSupplier: vi.fn(),
  upsertLoss: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  buildInspectionIssueCreateData: mocks.buildCreateData,
  createInspectionIssueId: vi.fn(() => 'issue-1'),
  findInspectionForIssue: mocks.findInspection,
  getNextInspectionIssueSerialNumber: mocks.getSerial,
  normalizeOptionalInspectionIssueString: (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
}));
vi.mock('~/modules/inspection/inspection-issue-welding', () => ({
  assertWelderForWeldingDefect: mocks.assertWelder,
}));
vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: { enqueueSupplierScores: mocks.enqueueScores },
}));
vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexService: {
    upsertFromInternalInTransaction: mocks.upsertLoss,
  },
}));
vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveSupplierById: mocks.resolveSupplier },
}));
vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveById: mocks.resolveDepartment },
}));

function createTx(
  options: { legacyMax?: number; sequenceStart?: number } = {},
): Prisma.TransactionClient {
  let currentValue = options.sequenceStart ?? 40;
  return {
    quality_records: {
      create: vi.fn(async ({ data }) => ({
        id: 'issue-1',
        nonConformanceNumber: data.nonConformanceNumber,
        supplierId: data.supplierId ?? null,
        lossAmount: 100,
      })),
    },
    sequences: {
      create: vi.fn(async () => {
        currentValue = 1;
        return { currentValue };
      }),
      findUnique: vi.fn(async () => ({ currentValue })),
      updateMany: vi.fn(async ({ data, where }) => {
        if (where.currentValue !== currentValue) return { count: 0 };
        currentValue = data.currentValue;
        return { count: 1 };
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ value: options.legacyMax ?? 40 }]),
  } as unknown as Prisma.TransactionClient;
}

const baseBody = {
  defectCategoryId: 'cat-1',
  defectSubcategoryId: 'sub-1',
  description: 'defect',
  partName: 'Bearing',
  processName: 'Welding',
  quantity: 1,
  reportDate: '2026-08-10',
  responsibleDepartmentId: 'dept-assembly',
  rootCause: 'cause',
  severity: 'Major',
  solution: 'repair',
  status: 'OPEN',
  workOrderNumber: 'WO-1',
};

describe('inspectionIssueCreateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findInspection.mockResolvedValue(null);
    mocks.getSerial.mockResolvedValue(9);
    mocks.resolveDepartment.mockResolvedValue({
      id: 'dept-assembly',
      name: 'Assembly',
    });
    mocks.resolveSupplier.mockResolvedValue({
      id: 'supplier-1',
      name: 'Supplier A',
    });
    mocks.buildCreateData.mockImplementation(async (body) => ({
      nonConformanceNumber: body.ncNumber,
      partName: body.partName,
      supplierId: body.supplierId ?? null,
    }));
  });

  it('creates an internal issue with a server-generated NC number and all transactional projections', async () => {
    const tx = createTx();
    const result = await InspectionIssueCreateService.createInTransaction({
      body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
      tx,
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-041');
    expect(mocks.buildCreateData).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleDepartment: 'Assembly',
        responsibleDepartmentId: 'dept-assembly',
        supplierId: undefined,
      }),
      expect.objectContaining({ serialNumber: 9 }),
    );
    expect(mocks.upsertLoss).toHaveBeenCalledWith(result.record, tx);
    expect(mocks.enqueueScores).toHaveBeenCalledWith(
      tx,
      [null],
      'inspection-issue.created',
    );
  });

  it('ignores a client NC number when a trusted internal caller reaches the service', async () => {
    const result = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        ncNumber: 'NC-FORGED-001',
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
      tx: createTx(),
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-041');
    expect(mocks.buildCreateData).toHaveBeenCalledWith(
      expect.objectContaining({ ncNumber: 'NC-26KJ-041' }),
      expect.any(Object),
    );
  });

  it.each(['SUPPLIER', 'OUTSOURCING_UNIT'] as const)(
    'canonicalizes supplier identity for %s responsibility',
    async (responsibilityType) => {
      const result = await InspectionIssueCreateService.createInTransaction({
        body: { ...baseBody, responsibilityType, supplierId: 'supplier-1' },
        tx: createTx(),
        userinfo: { id: 'u-1', username: 'qc' } as never,
      });

      expect(mocks.resolveSupplier).toHaveBeenCalledWith(
        'supplier-1',
        expect.any(Object),
      );
      expect(mocks.buildCreateData).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'supplier-1',
          supplierName: 'Supplier A',
        }),
        expect.any(Object),
      );
      expect(result.record.supplierId).toBe('supplier-1');
    },
  );

  it.each([
    [{ ...baseBody, responsibilityType: 'SUPPLIER' }, '外部责任单位缺少'],
    [
      {
        ...baseBody,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        supplierId: 'supplier-1',
      },
      '内部责任部门',
    ],
    [
      {
        ...baseBody,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartmentId: { value: 'dept-assembly' },
      },
      '必须是 ID 字符串',
    ],
    [
      {
        ...baseBody,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartments: ['dept-assembly'],
      },
      '不支持多个责任部门',
    ],
  ])('rejects invalid online responsibility input', async (body, message) => {
    await expect(
      InspectionIssueCreateService.createInTransaction({
        body,
        tx: createTx(),
        userinfo: { id: 'u-1', username: 'qc' } as never,
      }),
    ).rejects.toThrow(message);
  });

  it('uses distinct atomic sequence values for concurrent issue creates', async () => {
    const tx = createTx();
    const [first, second] = await Promise.all([
      InspectionIssueCreateService.createInTransaction({
        body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
        tx,
        userinfo: { id: 'u-1', username: 'qc' } as never,
      }),
      InspectionIssueCreateService.createInTransaction({
        body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
        tx,
        userinfo: { id: 'u-1', username: 'qc' } as never,
      }),
    ]);

    expect(new Set([first.ncNumber, second.ncNumber]).size).toBe(2);
  });

  it('bootstraps from a four-digit legacy number using its numeric suffix', async () => {
    const result = await InspectionIssueCreateService.createInTransaction({
      body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
      tx: createTx({ legacyMax: 1000, sequenceStart: 0 }),
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-1001');
  });

  it('retries the CAS loop when the sequence row moved concurrently', async () => {
    let currentValue = 40;
    const updateMany = vi
      .fn()
      .mockImplementationOnce(async () => {
        // Simulate a concurrent winner advancing 40 -> 41 before this CAS.
        currentValue = 41;
        return { count: 0 };
      })
      .mockImplementationOnce(
        async ({ data }: { data: { currentValue: number } }) => {
          currentValue = data.currentValue;
          return { count: 1 };
        },
      );
    const tx = {
      quality_records: {
        create: vi.fn(
          async ({ data }: { data: { nonConformanceNumber: string } }) => ({
            id: 'issue-1',
            nonConformanceNumber: data.nonConformanceNumber,
            supplierId: null,
            lossAmount: 100,
          }),
        ),
      },
      sequences: {
        create: vi.fn(),
        findUnique: vi.fn(async () => ({ currentValue })),
        updateMany,
      },
      $queryRaw: vi.fn().mockResolvedValue([{ value: 40 }]),
    } as unknown as Prisma.TransactionClient;

    const result = await InspectionIssueCreateService.createInTransaction({
      body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
      tx,
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-042');
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
