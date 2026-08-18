import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestQueryService } from './inspection-request-query.service';

const { resolveSuppliersByTeamIds } = vi.hoisted(() => ({
  resolveSuppliersByTeamIds: vi.fn(),
}));
const { findActiveByIdsOrNames, resolveActiveDepartmentSourceIdsByTeamIds } =
  vi.hoisted(() => ({
    findActiveByIdsOrNames: vi.fn(),
    resolveActiveDepartmentSourceIdsByTeamIds: vi.fn(),
  }));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveSuppliersByTeamIds },
}));
vi.mock('~/modules/dept', () => ({ DeptService: { findActiveByIdsOrNames } }));
vi.mock('~/modules/team', () => ({
  TeamIdentityService: { resolveActiveDepartmentSourceIdsByTeamIds },
}));

const { getUserPermissionCodes } = vi.hoisted(() => ({
  getUserPermissionCodes: vi.fn(),
}));

vi.mock('~/modules/rbac', () => ({
  RbacRoleService: { getUserPermissionCodes },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
  },
}));

describe('inspection request query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserPermissionCodes.mockResolvedValue([]);
    resolveSuppliersByTeamIds.mockResolvedValue(new Map());
    resolveActiveDepartmentSourceIdsByTeamIds.mockResolvedValue(new Map());
    findActiveByIdsOrNames.mockResolvedValue([]);
  });

  it('returns canonical external responsibility for a linked TEAM', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([
      {
        attachments: null,
        closeAttachments: null,
        dispatcher: null,
        inspection: null,
        inspectionId: null,
        inspector: null,
        linkedIssueId: null,
        process: { name: 'Welding' },
        processName: 'Legacy Welding',
        requestNo: 'IR-1',
        team: 'Legacy Team Name',
        teamId: 'team-1',
        workOrderNumber: 'WO-001',
        workOrders: [],
      },
    ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    resolveSuppliersByTeamIds.mockResolvedValue(
      new Map([['team-1', { id: 'supplier-1', name: 'Canonical Supplier' }]]),
    );
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-production', name: '生产 OBU' },
    ]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      {},
    );

    expect(result.items[0]?.issueResponsibility).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-1',
      supplierName: 'Canonical Supplier',
    });
    expect(resolveSuppliersByTeamIds).toHaveBeenCalledWith(['team-1']);
  });

  it('returns canonical supplier responsibility in request detail', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      attachments: null,
      closeAttachments: null,
      dispatcher: null,
      inspection: null,
      inspectionId: null,
      inspector: null,
      linkedIssueId: null,
      process: { name: '进货检验' },
      processName: '进货检验',
      requestNo: 'IR-1',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
      team: 'Supplier A',
      teamId: null,
      workOrderNumber: 'WO-001',
      workOrders: [],
    } as any);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-purchasing', name: '采购部' },
    ]);

    const result = await InspectionRequestQueryService.getRequestDetail('IR-1');

    expect(result?.issueResponsibility).toEqual({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
    expect(result).toMatchObject({
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('maps the persisted incoming supplier name to the task-list team display', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([
      {
        attachments: null,
        category: 'INCOMING',
        closeAttachments: null,
        dispatcher: null,
        inspection: null,
        inspectionId: null,
        inspector: null,
        linkedIssueId: null,
        process: { name: 'Incoming inspection' },
        processName: 'Incoming inspection',
        requestNo: 'IR-incoming',
        responsibilityType: 'SUPPLIER',
        responsibleDepartment: 'Purchasing',
        responsibleDepartmentId: 'dept-purchasing',
        supplierId: 'supplier-1',
        supplierName: 'Incoming Supplier A',
        team: null,
        teamId: null,
        workOrderNumber: 'WO-001',
        workOrders: [],
      },
    ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-purchasing', name: 'Purchasing' },
    ]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      {},
    );

    expect(result.items[0]).toMatchObject({
      supplierName: 'Incoming Supplier A',
      team: 'Incoming Supplier A',
      teamId: null,
    });
  });

  it('returns persisted direct internal responsibility without a TEAM', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      attachments: null,
      category: 'PROCESS',
      closeAttachments: null,
      dispatcher: null,
      inspection: null,
      inspectionId: null,
      inspector: null,
      linkedIssueId: null,
      process: { name: 'Machining' },
      processName: 'Machining',
      requestNo: 'IR-1',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierName: null,
      team: null,
      teamId: null,
      workOrderNumber: 'WO-001',
      workOrders: [],
    } as any);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-machining', name: 'Machining BU' },
    ]);

    const result = await InspectionRequestQueryService.getRequestDetail('IR-1');

    expect(result?.issueResponsibility).toEqual({
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: 'Machining BU',
      responsibleDepartmentId: 'dept-machining',
      supplierId: null,
      supplierName: '',
    });
    expect(result?.team).toBe('Machining BU');
    expect(resolveActiveDepartmentSourceIdsByTeamIds).toHaveBeenCalledWith(
      [],
      undefined,
    );
  });

  it('maps the internal responsibility department to the list team before close', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([
      {
        attachments: null,
        category: 'PROCESS',
        closeAttachments: null,
        dispatcher: null,
        inspection: null,
        inspectionId: null,
        inspector: null,
        linkedIssueId: null,
        process: { name: 'Structure' },
        processName: 'Structure',
        requestNo: 'IR-structure',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Structure BU1',
        responsibleDepartmentId: 'dept-structure',
        supplierId: null,
        supplierName: null,
        team: null,
        teamId: null,
        workOrderNumber: 'WO-001',
        workOrders: [],
      },
    ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-structure', name: 'Structure BU1' },
    ]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      {},
    );

    expect(result.items[0]).toMatchObject({
      responsibleDepartment: 'Structure BU1',
      team: 'Structure BU1',
    });
  });

  it('returns supplier responsibility for INCOMING category with a configured process name', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      attachments: null,
      category: 'INCOMING',
      closeAttachments: null,
      dispatcher: null,
      inspection: null,
      inspectionId: null,
      inspector: null,
      linkedIssueId: null,
      process: { name: '外购件' },
      processName: '外购件',
      requestNo: 'IR-1',
      supplierId: 'supplier-1',
      team: 'Supplier A',
      teamId: null,
      workOrderNumber: 'WO-001',
      workOrders: [],
    } as any);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);
    findActiveByIdsOrNames.mockResolvedValue([
      { id: 'dept-purchasing', name: '采购部' },
    ]);

    const result = await InspectionRequestQueryService.getRequestDetail('IR-1');

    expect(result?.issueResponsibility).toEqual({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchasing',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('maps material approval state from the request relation', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([
      {
        attachments: null,
        closeAttachments: null,
        dispatcher: null,
        inspection: null,
        inspectionId: null,
        inspector: null,
        linkedIssueId: null,
        materialRequest: {
          id: 'material-request-1',
          requestedName: 'Unregistered bearing',
          status: 'PENDING',
        },
        partId: null,
        partName: 'Unregistered bearing',
        process: { name: 'Incoming inspection' },
        requestNo: 'IR-1',
        workOrderNumber: 'WO-001',
        workOrders: [],
      },
    ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      {},
    );

    expect(result.items[0]).toMatchObject({
      dispatchBlockedReason: 'MATERIAL_APPROVAL_PENDING',
      materialApprovalStatus: 'PENDING',
      materialRequestId: 'material-request-1',
      requestedPartName: 'Unregistered bearing',
    });
  });

  it('falls back to legacy request list query when work order link table is not migrated', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockRejectedValueOnce({ code: 'P2021' })
      .mockResolvedValueOnce([
        {
          attachments: null,
          closeAttachments: null,
          dispatcher: null,
          inspection: null,
          inspectionId: null,
          inspector: null,
          linkedIssueId: null,
          process: null,
          requestNo: 'IR-1',
          workOrderNumber: 'WO-001',
        },
      ] as any);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(1);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      { current: 'true' },
    );

    expect(result.total).toBe(1);
    expect(result.items[0]?.workOrderNumbers).toEqual(['WO-001']);
    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledTimes(2);
  });

  it('rejects pending scope without the dispatch permission', async () => {
    getUserPermissionCodes.mockResolvedValue(['QMS:Inspection:Requests:Close']);

    await expect(
      InspectionRequestQueryService.getRequestList({ id: 'user-1' } as any, {
        scope: 'pending',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(prisma.qms_inspection_requests.findMany).not.toHaveBeenCalled();
  });

  it('rejects dispatched scope without the dispatch permission', async () => {
    getUserPermissionCodes.mockResolvedValue([]);

    await expect(
      InspectionRequestQueryService.getRequestList({ id: 'user-1' } as any, {
        scope: 'dispatched',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('filters pending scope to SUBMITTED requests for dispatch permission holders', async () => {
    getUserPermissionCodes.mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      { scope: 'pending' },
    );

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          status: 'SUBMITTED',
        }),
      }),
    );
  });

  it('filters dispatched scope to DISPATCHED and INSPECTING requests', async () => {
    getUserPermissionCodes.mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      { scope: 'dispatched' },
    );

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        }),
      }),
    );
  });

  it('restricts closed scope to my related requests without the dispatch permission', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-1',
    } as never);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1', userId: 'user-1' } as any,
      { scope: 'closed' },
    );

    const called = vi.mocked(prisma.qms_inspection_requests.findMany).mock
      .calls[0]?.[0] as { where: { AND?: unknown[] } };
    expect(called.where).toMatchObject({ status: 'CLOSED' });
    expect(called.where.AND).toEqual([
      {
        OR: [{ inspectorId: 'user-1' }, { reporterId: 'user-1' }],
      },
    ]);
  });

  it('restricts abnormal scope to my related requests without the dispatch permission', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'user-1',
    } as never);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1', userId: 'user-1' } as any,
      { scope: 'abnormal' },
    );

    const called = vi.mocked(prisma.qms_inspection_requests.findMany).mock
      .calls[0]?.[0] as { where: { AND?: unknown[] } };
    expect(called.where).toMatchObject({
      linkedIssueStatus: 'OPEN',
    });
    expect(called.where.AND).toEqual([
      {
        OR: [{ inspectorId: 'user-1' }, { reporterId: 'user-1' }],
      },
    ]);
  });

  it('filters abnormal scope to requests with an open linked NC', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      { scope: 'abnormal' },
    );

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          linkedIssueId: { not: null },
          linkedIssueStatus: 'OPEN',
        }),
      }),
    );
  });

  it('filters my-inspection scope to the current inspector within the last week', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'inspector-1',
    } as never);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1', userId: 'user-1' } as any,
      { scope: 'my-inspection' },
    );

    const called = vi.mocked(prisma.qms_inspection_requests.findMany).mock
      .calls[0]?.[0] as {
      where: { inspectorId: string; submittedAt: { gte: Date } };
    };
    expect(called.where.inspectorId).toBe('inspector-1');
    expect(called.where.submittedAt.gte.getTime()).toBeGreaterThan(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    );
  });

  it('filters my-report scope to the current reporter', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'reporter-1',
    } as never);
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'user-1', userId: 'user-1' } as any,
      { scope: 'my-report' },
    );

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          reporterId: 'reporter-1',
        }),
      }),
    );
  });

  it('returns minimal status fields for a public request number lookup', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      closedAt: null,
      dispatchedAt: new Date('2026-08-18T02:00:00.000Z'),
      dispatcher: { realName: '调度员' },
      inspector: { realName: '检验员' },
      linkedIssueStatus: null,
      requestNo: 'IR-20260818-0001',
      status: 'DISPATCHED',
    } as never);

    const result =
      await InspectionRequestQueryService.getPublicRequestStatus(
        'IR-20260818-0001',
      );

    expect(result).toEqual({
      closedAt: null,
      dispatchedAt: new Date('2026-08-18T02:00:00.000Z'),
      dispatcherName: '调度员',
      inspectorName: '检验员',
      linkedIssueStatus: null,
      requestNo: 'IR-20260818-0001',
      status: 'DISPATCHED',
    });
  });

  it('filters active tasks by inspector id and multiple statuses', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.count).mockResolvedValue(0);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    await InspectionRequestQueryService.getRequestList(
      { id: 'manager-1' } as any,
      {
        inspectorId: 'inspector-1',
        status: 'DISPATCHED,INSPECTING',
      },
    );

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          inspectorId: 'inspector-1',
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        }),
        orderBy: [
          { priority: 'asc' },
          { dispatchedAt: 'asc' },
          { submittedAt: 'asc' },
        ],
      }),
    );
  });
});
