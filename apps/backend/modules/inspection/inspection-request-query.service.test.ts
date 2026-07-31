import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestQueryService } from './inspection-request-query.service';

const { resolveSuppliersByTeamIds } = vi.hoisted(() => ({
  resolveSuppliersByTeamIds: vi.fn(),
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: { resolveSuppliersByTeamIds },
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
  },
}));

describe('inspection request query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSuppliersByTeamIds.mockResolvedValue(new Map());
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

    const result = await InspectionRequestQueryService.getRequestList(
      { id: 'user-1' } as any,
      {},
    );

    expect(result.items[0]?.issueResponsibility).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
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
      team: 'Supplier A',
      teamId: null,
      workOrderNumber: 'WO-001',
      workOrders: [],
    } as any);
    vi.mocked(prisma.quality_records.findMany).mockResolvedValue([]);

    const result = await InspectionRequestQueryService.getRequestDetail('IR-1');

    expect(result?.issueResponsibility).toEqual({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
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
