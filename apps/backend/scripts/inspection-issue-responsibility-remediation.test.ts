import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  assertInspectionIssueResponsibilityRemediationSucceeded,
  hasCorruptedResponsibleDepartment,
  parseInspectionIssueResponsibilityRemediationOptions,
  remediateCorruptedInspectionIssueResponsibilities,
  resolveCorruptedIssueResponsibility,
} from './inspection-issue-responsibility-remediation';

const { resolveSuppliersByTeamIds } = vi.hoisted(() => ({
  resolveSuppliersByTeamIds: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    qms_inspection_requests: { findMany: vi.fn() },
    quality_records: { findMany: vi.fn(), updateMany: vi.fn() },
    supplier_identity_links: { findMany: vi.fn() },
    unresolved_master_data_refs: { updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn() }),
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveSuppliersByTeamIds },
}));

const applyOptions = { batchSize: 100, mode: 'apply' as const };
const supplierA = { id: 'supplier-a', isDeleted: false, name: 'Supplier A' };
const supplierB = { id: 'supplier-b', name: 'Supplier B' };

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    inspection: null,
    inspectionId: null,
    responsibilityType: null,
    responsibleDepartment: '[object Object]',
    responsibleDepartmentId: null,
    responsibleDepartments: '["[object Object]"]',
    supplierId: null,
    supplierName: null,
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    category: 'INCOMING',
    inspection: null,
    inspectionLinks: [],
    linkedIssueId: 'issue-1',
    supplier: supplierA,
    supplierId: supplierA.id,
    teamId: null,
    ...overrides,
  };
}

function mockScan(issues: unknown[], requests: unknown[]) {
  vi.mocked(prisma.quality_records.findMany)
    .mockResolvedValueOnce(issues as never)
    .mockResolvedValueOnce([]);
  vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValueOnce(
    requests as never,
  );
}

describe('inspection issue responsibility remediation', () => {
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
    resolveSuppliersByTeamIds.mockResolvedValue(new Map());
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: any) =>
      callback(prisma)) as any);
  });

  it('recognizes only the exact object-string sentinel in legacy fields', () => {
    expect(hasCorruptedResponsibleDepartment('[object Object]', null)).toBe(
      true,
    );
    expect(
      hasCorruptedResponsibleDepartment(
        '质量部',
        '["质量部","[object Object]"]',
      ),
    ).toBe(true);
    expect(
      hasCorruptedResponsibleDepartment(
        '质量部',
        '{"value":"[object Object]"}',
      ),
    ).toBe(false);
  });

  it('parses dry-run/apply and bounded batch options', () => {
    expect(
      parseInspectionIssueResponsibilityRemediationOptions([], {}),
    ).toEqual({ batchSize: 200, mode: 'dry-run' });
    expect(
      parseInspectionIssueResponsibilityRemediationOptions(
        ['--apply', '--batch-size=5000', '--max-batches=2'],
        {},
      ),
    ).toEqual({ batchSize: 1000, maxBatches: 2, mode: 'apply' });
  });

  it('repairs a corrupted snapshot from a valid canonical department ID', async () => {
    mockScan(
      [
        issue({
          responsibleDepartmentId: 'dept-quality',
          responsibleDepartments: '["[object Object]"]',
        }),
      ],
      [],
    );

    await expect(
      remediateCorruptedInspectionIssueResponsibilities(applyOptions),
    ).resolves.toMatchObject({ plannedOrUpdated: 1, unresolved: 0 });
    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'issue-1',
        isDeleted: false,
        responsibilityType: null,
        responsibleDepartment: '[object Object]',
        responsibleDepartmentId: 'dept-quality',
        responsibleDepartments: '["[object Object]"]',
        supplierId: null,
        supplierName: null,
      },
      data: {
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: '质量部',
        responsibleDepartmentId: 'dept-quality',
        responsibleDepartments: '["质量部"]',
        supplierId: null,
        supplierName: null,
      },
    });
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'issue-1',
          fieldName: 'responsibleDepartmentId',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('uses unique related incoming evidence when the record lacks a department ID', async () => {
    mockScan([issue()], [request()]);

    await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          responsibilityType: 'SUPPLIER',
          responsibleDepartment: '采购部',
          responsibleDepartmentId: 'dept-purchase',
          responsibleDepartments: '["采购部"]',
          supplierId: 'supplier-a',
          supplierName: 'Supplier A',
        },
      }),
    );
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          evidence: {
            supplierId: 'supplier-a',
            supplierName: 'Supplier A',
          },
          resolvedId: 'dept-purchase',
        }),
        where: expect.objectContaining({
          entityId: 'issue-1',
          fieldName: 'responsibleDepartmentId',
        }),
      }),
    );
  });

  it('keeps unresolved records unchanged and reopens an OPEN audit', async () => {
    mockScan([issue()], []);

    const result =
      await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ unresolved: 1, plannedOrUpdated: 0 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'issue-1',
          reason: 'MISSING_CANONICAL_RESPONSIBILITY_EVIDENCE',
        }),
        update: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('keeps conflicting canonical request and inspection evidence unchanged', async () => {
    resolveSuppliersByTeamIds.mockResolvedValue(
      new Map([['team-external', supplierB]]),
    );
    mockScan(
      [
        issue({
          inspection: {
            category: 'PROCESS',
            supplier: null,
            supplierId: null,
            teamId: 'team-external',
          },
          inspectionId: 'inspection-1',
        }),
      ],
      [request()],
    );

    const result =
      await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ conflicts: 1, unresolved: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
        }),
      }),
    );
  });

  it('is idempotent when a false-positive text search returns an already canonical row', async () => {
    mockScan(
      [
        issue({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: '质量部',
          responsibleDepartmentId: 'dept-quality',
          responsibleDepartments: '["质量部"]',
        }),
      ],
      [],
    );

    const result =
      await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ plannedOrUpdated: 0, skipped: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
  });

  it('keeps dry-run read-only while reporting both planned updates and unresolved rows', async () => {
    mockScan([issue(), issue({ id: 'issue-2' })], [request()]);

    const result = await remediateCorruptedInspectionIssueResponsibilities({
      batchSize: 100,
      mode: 'dry-run',
    });

    expect(result).toMatchObject({ plannedOrUpdated: 1, unresolved: 1 });
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('reports a lost compare-and-set update without resolving its audit', async () => {
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 0,
    });
    mockScan([issue()], [request()]);

    const result =
      await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(result).toMatchObject({ concurrentChanges: 1, plannedOrUpdated: 0 });
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('does not let an existing contradictory responsibility type overwrite canonical evidence', () => {
    expect(
      resolveCorruptedIssueResponsibility({
        candidates: [
          {
            department: { id: 'dept-purchase', name: '采购部' },
            responsibilityType: 'SUPPLIER',
            source: 'request',
            supplier: supplierA,
          },
        ],
        existingDepartment: null,
        existingResponsibilityType: 'OUTSOURCING_UNIT',
        existingSupplierId: 'supplier-a',
        existingSupplierName: 'Supplier A',
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'CONFLICTING_RESPONSIBILITY_TYPE',
    });
  });

  it('clears a complete stale supplier snapshot for an internal canonical department', async () => {
    mockScan(
      [
        issue({
          responsibleDepartmentId: 'dept-quality',
          supplierId: 'supplier-stale',
          supplierName: 'Stale supplier',
        }),
      ],
      [],
    );

    await remediateCorruptedInspectionIssueResponsibilities(applyOptions);

    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supplierId: null, supplierName: null }),
        where: expect.objectContaining({
          supplierId: 'supplier-stale',
          supplierName: 'Stale supplier',
        }),
      }),
    );
  });

  it('blocks conflicting or incomplete existing supplier facts instead of overwriting them', () => {
    const candidate = {
      department: { id: 'dept-purchase', name: '采购部' },
      responsibilityType: 'SUPPLIER' as const,
      source: 'request' as const,
      supplier: { id: 'supplier-a', name: 'Supplier A' },
    };
    expect(
      resolveCorruptedIssueResponsibility({
        candidates: [candidate],
        existingDepartment: null,
        existingResponsibilityType: null,
        existingSupplierId: 'supplier-other',
        existingSupplierName: 'Other supplier',
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    });
    expect(
      resolveCorruptedIssueResponsibility({
        candidates: [candidate],
        existingDepartment: null,
        existingResponsibilityType: null,
        existingSupplierId: 'supplier-a',
        existingSupplierName: null,
      }),
    ).toEqual({
      action: 'unresolved',
      reason: 'CONFLICTING_CANONICAL_RESPONSIBILITY_EVIDENCE',
    });
  });

  it('fails an apply summary for unresolved, conflicting, or concurrent changes', () => {
    expect(() =>
      assertInspectionIssueResponsibilityRemediationSucceeded({
        batches: 1,
        concurrentChanges: 1,
        conflicts: 2,
        mode: 'apply',
        plannedOrUpdated: 0,
        processed: 3,
        skipped: 0,
        unresolved: 3,
      }),
    ).toThrow('unresolved=3, conflicts=2, concurrentChanges=1');
    expect(() =>
      assertInspectionIssueResponsibilityRemediationSucceeded({
        batches: 1,
        concurrentChanges: 0,
        conflicts: 0,
        mode: 'dry-run',
        plannedOrUpdated: 0,
        processed: 1,
        skipped: 0,
        unresolved: 1,
      }),
    ).toThrow('unresolved=1');
  });
});
