import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  backfillInspectionIssueResponsibilities,
  parseResponsibilityBackfillOptions,
  resolveInspectionIssueResponsibility,
} from './inspection-issue-responsibility-backfill';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    qms_inspection_requests: { findMany: vi.fn() },
    quality_records: { findMany: vi.fn(), updateMany: vi.fn() },
    supplier_identity_links: { findMany: vi.fn() },
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn() }),
}));

const applyOptions = { batchSize: 100, mode: 'apply' as const };
const supplierA = { id: 'supplier-a', isDeleted: false, name: 'Supplier A' };
const supplierB = { id: 'supplier-b', isDeleted: false, name: 'Supplier B' };

function inspection(
  category: 'INCOMING' | 'PROCESS',
  supplier: null | typeof supplierA,
) {
  return {
    category,
    supplier,
    supplierId: supplier?.id || null,
  };
}

function request(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'request-1',
    inspection: null,
    inspectionLinks: [],
    linkedIssueId: 'issue-1',
    processName: '进货检验',
    requestNo: 'IR-1',
    supplier: supplierA,
    supplierId: supplierA.id,
    teamId: null,
    ...overrides,
  };
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    inspection: null,
    responsibleDepartment: 'Supplier A',
    responsibleDepartmentId: null,
    supplier: null,
    supplierId: null,
    supplierName: null,
    ...overrides,
  };
}

function mockScan(requests: unknown[], issues: unknown[]) {
  vi.mocked(prisma.qms_inspection_requests.findMany)
    .mockResolvedValueOnce(requests as never)
    .mockResolvedValueOnce([]);
  vi.mocked(prisma.quality_records.findMany).mockResolvedValueOnce(
    issues as never,
  );
}

describe('inspection issue responsibility backfill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.departments.findMany).mockResolvedValue([
      { id: 'dept-purchase', name: '采购部' },
      { id: 'dept-production', name: '生产 OBU' },
      { id: 'dept-quality', name: '质量部' },
    ] as never);
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue(
      [] as never,
    );
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.unresolved_master_data_refs.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.unresolved_master_data_refs.upsert).mockResolvedValue(
      {} as never,
    );
    vi.mocked(prisma.$transaction).mockImplementation(((
      operations: Promise<unknown>[],
    ) => Promise.all(operations)) as any);
  });

  it('parses dry-run/apply and bounded batch options', () => {
    expect(parseResponsibilityBackfillOptions([], {})).toEqual({
      batchSize: 200,
      mode: 'dry-run',
    });
    expect(
      parseResponsibilityBackfillOptions(
        ['--apply', '--batch-size=5000', '--max-batches=2'],
        {},
      ),
    ).toEqual({ batchSize: 1000, maxBatches: 2, mode: 'apply' });
    expect(() =>
      parseResponsibilityBackfillOptions(['--batch-size=0'], {}),
    ).toThrow('--batch-size must be a positive integer');
  });

  it('rejects conflicting canonical supplier evidence', () => {
    expect(
      resolveInspectionIssueResponsibility({
        departmentByName: new Map([
          ['采购部', { id: 'dept-purchase', name: '采购部' }],
        ]),
        existingDepartment: null,
        existingDepartmentId: null,
        existingSupplier: null,
        existingSupplierId: null,
        inspectionCategories: ['INCOMING'],
        processName: '进货检验',
        supplierEvidence: [
          { candidate: supplierA, rawId: supplierA.id, source: 'request' },
          { candidate: supplierB, rawId: 'team-1', source: 'team' },
        ],
      }),
    ).toMatchObject({
      action: 'unresolved',
      fieldName: 'supplierId',
      reason: 'CONFLICTING_SUPPLIER_EVIDENCE',
    });
  });

  it('does not classify an internal process inspection as an external unit', () => {
    expect(
      resolveInspectionIssueResponsibility({
        departmentByName: new Map(),
        existingDepartment: null,
        existingDepartmentId: null,
        existingSupplier: null,
        existingSupplierId: null,
        inspectionCategories: ['PROCESS'],
        processName: '焊接',
        supplierEvidence: [
          { candidate: null, rawId: 'team-internal', source: 'team' },
        ],
      }),
    ).toEqual({ action: 'skip', reason: 'NOT_EXTERNAL' });
  });

  it('moves an incoming supplier from responsibility department to canonical fields', async () => {
    mockScan([request()], [issue()]);

    await expect(
      backfillInspectionIssueResponsibilities(applyOptions),
    ).resolves.toMatchObject({
      concurrentChanges: 0,
      plannedOrUpdated: 1,
      unresolved: 0,
    });
    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'issue-1',
        isDeleted: false,
        responsibleDepartment: 'Supplier A',
        responsibleDepartmentId: null,
        supplierId: null,
        supplierName: null,
      },
      data: {
        responsibleDepartmentId: 'dept-purchase',
        supplierId: 'supplier-a',
      },
    });
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'issue-1',
          fieldName: 'supplierId',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('uses a TEAM identity link for an outsourcing unit', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        supplier: supplierA,
      },
    ] as never);
    mockScan(
      [
        request({
          processName: '焊接',
          supplier: null,
          supplierId: null,
          teamId: 'team-1',
        }),
      ],
      [issue()],
    );

    await backfillInspectionIssueResponsibilities(applyOptions);

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-a',
        },
      }),
    );
  });

  it('falls back to a canonical linked inspection supplier', async () => {
    mockScan(
      [
        request({
          inspection: inspection('PROCESS', supplierA),
          processName: '焊接',
          supplier: null,
          supplierId: null,
          teamId: null,
        }),
      ],
      [issue()],
    );

    await backfillInspectionIssueResponsibilities(applyOptions);

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 'supplier-a',
        }),
      }),
    );
  });

  it('keeps conflicts unchanged and persists an OPEN audit', async () => {
    vi.mocked(prisma.supplier_identity_links.findMany).mockResolvedValue([
      {
        identityId: 'team-1',
        supplier: supplierB,
      },
    ] as never);
    mockScan([request({ teamId: 'team-1' })], [issue()]);

    const result = await backfillInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ conflicts: 1, unresolved: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'issue-1',
          fieldName: 'supplierId',
          reason: 'CONFLICTING_SUPPLIER_EVIDENCE',
        }),
        update: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it('does not overwrite another valid responsible department ID', async () => {
    mockScan(
      [request()],
      [
        issue({
          responsibleDepartment: '质量部',
          responsibleDepartmentId: 'dept-quality',
        }),
      ],
    );

    const result = await backfillInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ conflicts: 1, unresolved: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fieldName: 'responsibleDepartmentId',
          rawId: 'dept-quality',
          reason: 'CONFLICTING_DEPARTMENT_IDENTITY',
        }),
      }),
    );
  });

  it('audits an external request without deterministic supplier evidence', async () => {
    mockScan(
      [
        request({
          processName: '外协焊接',
          supplier: null,
          supplierId: null,
        }),
      ],
      [issue()],
    );

    const result = await backfillInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ conflicts: 0, unresolved: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          fieldName: 'supplierId',
          reason: 'MISSING_EXTERNAL_SUPPLIER_EVIDENCE',
        }),
        update: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it('keeps dry-run read-only and reports planned updates', async () => {
    mockScan([request()], [issue()]);

    const result = await backfillInspectionIssueResponsibilities({
      batchSize: 100,
      mode: 'dry-run',
    });

    expect(result.plannedOrUpdated).toBe(1);
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('is idempotent when supplier and department snapshots are canonical', async () => {
    mockScan(
      [request()],
      [
        issue({
          responsibleDepartment: '采购部',
          responsibleDepartmentId: 'dept-purchase',
          supplier: supplierA,
          supplierId: supplierA.id,
          supplierName: supplierA.name,
        }),
      ],
    );

    const result = await backfillInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ plannedOrUpdated: 0, skipped: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledTimes(
      2,
    );
  });

  it('reports a concurrent change when the compare-and-set update loses', async () => {
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 0,
    });
    mockScan([request()], [issue()]);

    const result = await backfillInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({
      concurrentChanges: 1,
      plannedOrUpdated: 0,
    });
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });
});
