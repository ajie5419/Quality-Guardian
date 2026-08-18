import type { Prisma } from '@prisma/client';

import { SUPPLIER_CATEGORY } from '@qgs/shared';
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
vi.mock('~/modules/data-lifecycle', () => ({
  resolveRetainUntil: vi
    .fn()
    .mockResolvedValue(new Date('2026-08-18T00:00:00.000Z')),
}));

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: { enqueueSupplierScores: mocks.enqueueScores },
}));
vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexQueue: { enqueue: mocks.upsertLoss },
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
  const legacyMax = options.legacyMax ?? 40;
  let queryCount = 0;
  let executeCount = 0;
  return {
    quality_records: {
      create: vi.fn(async ({ data }) => ({
        id: 'issue-1',
        nonConformanceNumber: data.nonConformanceNumber,
        supplierId: data.supplierId ?? null,
        lossAmount: 100,
      })),
    },
    $executeRaw: vi.fn(async () => {
      if (executeCount++ === 0)
        currentValue = Math.max(currentValue, legacyMax);
      else currentValue++;
      return 1;
    }),
    $queryRaw: vi.fn(async () =>
      queryCount++ % 2 === 0 ? [{ value: legacyMax }] : [{ currentValue }],
    ),
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
    mocks.buildCreateData.mockImplementation(async (body, options) => ({
      nonConformanceNumber: options.nonConformanceNumber,
      partName: body.partName,
      supplierId: body.supplierId ?? null,
    }));
  });

  it('creates an internal issue with a server-generated NC number and all transactional projections', async () => {
    const tx = createTx();
    const result = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        generateNcNumber: true,
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
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
    expect(mocks.upsertLoss).toHaveBeenCalledWith(
      tx,
      [{ source: 'INTERNAL', sourcePk: result.record.id }],
      'inspection-issue.created',
    );
    expect(mocks.enqueueScores).toHaveBeenCalledWith(
      tx,
      [null],
      'inspection-issue.created',
    );
  });

  it('rejects client-provided NC numbers even for internal service callers', async () => {
    await expect(
      InspectionIssueCreateService.createInTransaction({
        body: {
          ...baseBody,
          ncNumber: 'NC-FORGED-001',
          responsibilityType: 'INTERNAL_DEPARTMENT',
        },
        tx: createTx(),
        userinfo: { id: 'u-1', username: 'qc' } as never,
      }),
    ).rejects.toThrow('不合格编号由系统生成');
  });

  it.each([
    ['SUPPLIER', SUPPLIER_CATEGORY.SUPPLIER],
    ['OUTSOURCING_UNIT', SUPPLIER_CATEGORY.OUTSOURCING],
  ] as const)(
    'canonicalizes supplier identity for %s responsibility',
    async (responsibilityType, supplierCategory) => {
      mocks.resolveSupplier.mockResolvedValueOnce({
        category: supplierCategory,
        id: 'supplier-1',
        name: 'Supplier A',
      });
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

  it('advances the transactional sequence for each generated issue', async () => {
    const tx = createTx();
    const first = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        generateNcNumber: true,
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
      tx,
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });
    const second = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        generateNcNumber: true,
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
      tx,
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(new Set([first.ncNumber, second.ncNumber]).size).toBe(2);
  });

  it('bootstraps from a four-digit legacy number using its numeric suffix', async () => {
    const result = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        generateNcNumber: true,
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
      tx: createTx({ legacyMax: 1000, sequenceStart: 0 }),
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-1001');
  });

  it('does not allocate a formal number when generation is disabled', async () => {
    const result = await InspectionIssueCreateService.createInTransaction({
      body: { ...baseBody, responsibilityType: 'INTERNAL_DEPARTMENT' },
      tx: createTx(),
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBeNull();
  });

  it('starts a new year at formal number 001', async () => {
    const result = await InspectionIssueCreateService.createInTransaction({
      body: {
        ...baseBody,
        generateNcNumber: true,
        responsibilityType: 'INTERNAL_DEPARTMENT',
      },
      tx: createTx({ legacyMax: 0, sequenceStart: 0 }),
      userinfo: { id: 'u-1', username: 'qc' } as never,
    });

    expect(result.ncNumber).toBe('NC-26KJ-001');
  });
});
