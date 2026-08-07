import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  backfillInspectionIssueDivisions,
  buildDivisionIdentityContext,
  parseDivisionBackfillOptions,
  resolveDivisionIdentity,
} from './inspection-issue-division-backfill';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: { findMany: vi.fn() },
    dictionaries: { findMany: vi.fn() },
    work_orders: { findMany: vi.fn(), updateMany: vi.fn() },
    qms_inspection_requests: { findMany: vi.fn() },
    quality_records: { findMany: vi.fn(), updateMany: vi.fn() },
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const applyOptions = {
  batchSize: 100,
  mode: 'apply' as const,
};

const departments = [
  { id: 'dept-a', name: 'Division A' },
  { id: 'dept-b', name: 'Division B' },
];

function mockIdentityContext() {
  vi.mocked(prisma.departments.findMany).mockResolvedValue(
    departments as never,
  );
  vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
    { dictKey: 'Division A', id: 'legacy-a' },
  ] as never);
}

function mockWorkOrders(rows: unknown[]) {
  vi.mocked(prisma.work_orders.findMany)
    .mockResolvedValueOnce(rows as never)
    .mockResolvedValueOnce([]);
}

function mockRequests(rows: unknown[]) {
  vi.mocked(prisma.qms_inspection_requests.findMany)
    .mockResolvedValueOnce(rows as never)
    .mockResolvedValueOnce([]);
}

describe('inspection issue division backfill', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(((
      operations: Promise<unknown>[],
    ) => Promise.all(operations)) as any);
  });

  it('parses dry-run/apply and bounded batch options', () => {
    expect(parseDivisionBackfillOptions([], {})).toEqual({
      batchSize: 200,
      mode: 'dry-run',
    });
    expect(
      parseDivisionBackfillOptions(
        ['--apply', '--batch-size=5000', '--max-batches=3'],
        {},
      ),
    ).toEqual({ batchSize: 1000, maxBatches: 3, mode: 'apply' });
    expect(() => parseDivisionBackfillOptions(['--batch-size=0'], {})).toThrow(
      '--batch-size must be a positive integer',
    );
  });

  it('resolves canonical IDs, department IDs in snapshots, names and legacy dictionary IDs', () => {
    const context = buildDivisionIdentityContext(departments, [
      { dictKey: 'Division B', id: 'legacy-b' },
    ]);

    expect(
      resolveDivisionIdentity(
        { division: null, divisionId: 'dept-a' },
        context,
      ),
    ).toMatchObject({ action: 'resolved', candidate: departments[0] });
    expect(
      resolveDivisionIdentity(
        { division: 'dept-b', divisionId: null },
        context,
      ),
    ).toMatchObject({ action: 'resolved', candidate: departments[1] });
    expect(
      resolveDivisionIdentity(
        { division: 'Division A', divisionId: null },
        context,
      ),
    ).toMatchObject({ action: 'resolved', candidate: departments[0] });
    expect(
      resolveDivisionIdentity(
        { division: null, divisionId: 'legacy-b' },
        context,
      ),
    ).toMatchObject({ action: 'resolved', candidate: departments[1] });

    const ambiguousContext = buildDivisionIdentityContext(
      [
        { id: 'dept-duplicate-1', name: 'Duplicate' },
        { id: 'dept-duplicate-2', name: 'Duplicate' },
      ],
      [],
    );
    expect(
      resolveDivisionIdentity(
        { division: 'Duplicate', divisionId: null },
        ambiguousContext,
      ),
    ).toEqual({
      action: 'unresolved',
      reason: 'AMBIGUOUS_DEPARTMENT_NAME',
    });
  });

  it('reports opposing canonical evidence without selecting either candidate', () => {
    const context = buildDivisionIdentityContext(departments, []);

    expect(
      resolveDivisionIdentity(
        { division: 'Division B', divisionId: 'dept-a' },
        context,
      ),
    ).toMatchObject({
      action: 'conflict',
      reason: 'CONFLICTING_DIVISION_EVIDENCE',
    });
  });

  it('normalizes work orders before linked issues and restores the primary inspection link', async () => {
    mockIdentityContext();
    mockWorkOrders([
      {
        division: null,
        divisionId: 'legacy-a',
        workOrderNumber: 'WO-1',
      },
    ]);
    mockRequests([
      {
        id: 'request-1',
        inspectionId: null,
        linkedIssueId: 'issue-1',
        inspectionLinks: [{ inspectionId: 'inspection-primary' }],
        work_order: { division: null, divisionId: 'legacy-a' },
      },
    ]);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      {
        division: null,
        divisionId: null,
        id: 'issue-1',
        inspectionId: null,
      },
    ] as never);
    vi.mocked(prisma.work_orders.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.quality_records.updateMany).mockResolvedValue({
      count: 1,
    });

    await expect(
      backfillInspectionIssueDivisions(applyOptions),
    ).resolves.toMatchObject({
      issues: { conflicts: 0, plannedOrUpdated: 1 },
      workOrders: { conflicts: 0, plannedOrUpdated: 1 },
    });
    expect(prisma.work_orders.updateMany).toHaveBeenCalledWith({
      where: {
        division: null,
        divisionId: 'legacy-a',
        isDeleted: false,
        workOrderNumber: 'WO-1',
      },
      data: { divisionId: 'dept-a' },
    });
    expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
      where: {
        division: null,
        divisionId: null,
        id: 'issue-1',
        inspectionId: null,
        isDeleted: false,
      },
      data: {
        divisionId: 'dept-a',
        inspectionId: 'inspection-primary',
      },
    });
    expect(
      vi.mocked(prisma.work_orders.updateMany).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(prisma.qms_inspection_requests.findMany).mock
        .invocationCallOrder[0] || Number.MAX_SAFE_INTEGER,
    );
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'WO-1',
          entityType: 'work_orders',
          fieldName: 'divisionId',
          status: 'OPEN',
        }),
      }),
    );
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'issue-1',
          entityType: 'quality_records',
          fieldName: 'inspectionId',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('uses keyset batches until both work order and request scans are exhausted', async () => {
    mockIdentityContext();
    vi.mocked(prisma.work_orders.findMany)
      .mockResolvedValueOnce([
        {
          division: 'Division A',
          divisionId: 'dept-a',
          workOrderNumber: 'WO-1',
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          division: 'Division B',
          divisionId: 'dept-b',
          workOrderNumber: 'WO-2',
        },
      ] as never)
      .mockResolvedValueOnce([]);
    mockRequests([]);

    const result = await backfillInspectionIssueDivisions({
      batchSize: 1,
      mode: 'dry-run',
    });

    expect(result.workOrders).toMatchObject({ batches: 2, processed: 2 });
    expect(prisma.work_orders.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          isDeleted: false,
          workOrderNumber: { gt: 'WO-1' },
        },
      }),
    );
  });

  it('is idempotent when canonical snapshots and inspection links are already present', async () => {
    mockIdentityContext();
    mockWorkOrders([
      {
        division: 'Division A',
        divisionId: 'dept-a',
        workOrderNumber: 'WO-1',
      },
    ]);
    mockRequests([
      {
        id: 'request-1',
        inspectionId: 'inspection-1',
        linkedIssueId: 'issue-1',
        inspectionLinks: [{ inspectionId: 'inspection-1' }],
        work_order: { division: 'Division A', divisionId: 'dept-a' },
      },
    ]);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      {
        division: 'Division A',
        divisionId: 'dept-a',
        id: 'issue-1',
        inspectionId: 'inspection-1',
      },
    ] as never);

    const result = await backfillInspectionIssueDivisions(applyOptions);

    expect(result.workOrders.plannedOrUpdated).toBe(0);
    expect(result.issues.plannedOrUpdated).toBe(0);
    expect(prisma.work_orders.updateMany).not.toHaveBeenCalled();
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityId: 'issue-1',
          entityType: 'quality_records',
          fieldName: 'divisionId',
          status: 'OPEN',
        }),
      }),
    );
  });

  it('keeps dry-run read-only while reporting planned updates', async () => {
    mockIdentityContext();
    mockWorkOrders([
      {
        division: 'dept-a',
        divisionId: null,
        workOrderNumber: 'WO-1',
      },
    ]);
    mockRequests([
      {
        id: 'request-1',
        inspectionId: 'inspection-1',
        linkedIssueId: 'issue-1',
        inspectionLinks: [],
        work_order: { division: 'dept-a', divisionId: null },
      },
    ]);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      {
        division: null,
        divisionId: null,
        id: 'issue-1',
        inspectionId: null,
      },
    ] as never);

    const result = await backfillInspectionIssueDivisions({
      batchSize: 100,
      mode: 'dry-run',
    });

    expect(result.workOrders.plannedOrUpdated).toBe(1);
    expect(result.issues.plannedOrUpdated).toBe(1);
    expect(prisma.work_orders.updateMany).not.toHaveBeenCalled();
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
  });

  it('reports division and inspection conflicts without overwriting either field', async () => {
    mockIdentityContext();
    mockWorkOrders([]);
    mockRequests([
      {
        id: 'request-1',
        inspectionId: 'inspection-request',
        linkedIssueId: 'issue-1',
        inspectionLinks: [],
        work_order: { division: 'Division A', divisionId: 'dept-a' },
      },
    ]);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([
      {
        division: 'Division B',
        divisionId: 'dept-b',
        id: 'issue-1',
        inspectionId: 'inspection-existing',
      },
    ] as never);

    const result = await backfillInspectionIssueDivisions(applyOptions);

    expect(result.issues.conflicts).toBe(2);
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        reason: 'CONFLICTING_ISSUE_AND_WORK_ORDER_DIVISION',
      }),
      expect.objectContaining({ reason: 'CONFLICTING_INSPECTION_LINK' }),
    ]);
    expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType_entityId_fieldName: {
            entityId: 'issue-1',
            entityType: 'quality_records',
            fieldName: 'divisionId',
          },
        },
        update: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entityType_entityId_fieldName: {
            entityId: 'issue-1',
            entityType: 'quality_records',
            fieldName: 'inspectionId',
          },
        },
        update: expect.not.objectContaining({ status: expect.anything() }),
      }),
    );
  });

  it('upserts repeated unresolved evidence through the same audit identity', async () => {
    mockIdentityContext();
    const conflictingWorkOrder = {
      division: 'Division B',
      divisionId: 'dept-a',
      workOrderNumber: 'WO-conflict',
    };
    vi.mocked(prisma.work_orders.findMany)
      .mockResolvedValueOnce([conflictingWorkOrder] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([conflictingWorkOrder] as never)
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await backfillInspectionIssueDivisions(applyOptions);
    await backfillInspectionIssueDivisions(applyOptions);

    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          entityType_entityId_fieldName: {
            entityId: 'WO-conflict',
            entityType: 'work_orders',
            fieldName: 'divisionId',
          },
        },
      }),
    );
  });

  it('counts a failed compare-and-set as a concurrent change', async () => {
    mockIdentityContext();
    mockWorkOrders([
      {
        division: 'dept-a',
        divisionId: null,
        workOrderNumber: 'WO-1',
      },
    ]);
    mockRequests([]);
    vi.mocked(prisma.work_orders.updateMany).mockResolvedValue({ count: 0 });

    const result = await backfillInspectionIssueDivisions(applyOptions);

    expect(result.workOrders).toMatchObject({
      concurrentChanges: 1,
      plannedOrUpdated: 0,
    });
    expect(
      prisma.unresolved_master_data_refs.updateMany,
    ).not.toHaveBeenCalled();
  });
});
