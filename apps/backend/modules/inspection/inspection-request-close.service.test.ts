import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import {
  hydrateOutsourcingLinkedIssueResponsibility,
  InspectionRequestCloseService,
} from '~/modules/inspection/inspection-request-close.service';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { TeamIdentityService } from '~/modules/team';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
    },
    inspections: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveById: vi.fn(),
    findActiveByIdsOrNames: vi.fn(),
  },
}));

vi.mock('~/modules/team', () => ({
  TeamIdentityService: {
    resolveActiveDepartmentSourceIdsByTeamIds: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-close.schema', async () => {
  const { BusinessError: BE } = await import('~/utils/business-error');
  return {
    failCloseRequest: (prefix: string, message: string) => {
      const map: Record<string, number> = {
        VALIDATION: 400,
        BAD_REQUEST: 400,
        CONFLICT: 409,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        INTERNAL: 500,
      };
      throw new BE(prefix, message, map[prefix] ?? 400);
    },
    parseCloseRequestNumber: (value: unknown, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    validateCloseRequestBody: vi.fn(),
  };
});

vi.mock(
  '~/modules/inspection/inspection-request-close-records.service',
  () => ({
    createCloseInspectionRecords: vi
      .fn()
      .mockResolvedValue([
        { inspectionId: 'i-1', isPrimary: true, workOrderNumber: 'WO-1' },
      ]),
  }),
);

vi.mock('~/modules/inspection/inspection-request-close-issue.service', () => ({
  buildCloseLinkedIssueCreateResult: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-request-close-access.service', () => ({
  ensureCloseRequestAccess: vi.fn(),
}));

vi.mock(
  '~/modules/inspection/inspection-request-close-effects.service',
  () => ({
    runClosePostCommitTask: vi
      .fn()
      .mockImplementation((_label, task) => task()),
    syncCloseAttachments: vi.fn(),
    syncCloseIssueEffects: vi.fn(),
  }),
);

vi.mock('~/modules/inspection/inspection-request', () => ({
  INSPECTION_REQUEST_STATUS: { CLOSED: 'CLOSED', INSPECTING: 'INSPECTING' },
  mapInspectionRequest: vi.fn().mockImplementation((r) => r),
  normalizeInspectionRequestAttachments: vi
    .fn()
    .mockReturnValue([{ name: 'f.pdf', url: 'http://example.com/f.pdf' }]),
  normalizeInspectionRequestText: vi.fn().mockImplementation((v) => v || ''),
  parseInspectionRequestQuantity: vi.fn().mockReturnValue(1),
  resolveInspectionRequestCurrentUserId: vi.fn().mockResolvedValue('user-1'),
}));

vi.mock('~/modules/inspection/inspection-request-work-orders', () => ({
  inspectionRequestWorkOrdersInclude: {},
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/metric-refresh', () => ({
  MetricRefreshQueue: {
    enqueueSupplierScoresForInspectionIdentities: vi.fn(),
  },
}));

const mockRequest = {
  attachments: JSON.stringify([
    { name: 'self.pdf', url: 'http://example.com/self.pdf' },
  ]),
  id: 'req-1',
  inspectorId: null,
  isDeleted: false,
  linkedIssueId: null,
  linkedIssueNo: null,
  linkedIssueStatus: null,
  partName: 'Bearing',
  process: { name: 'Welding' },
  processName: 'Welding',
  quantity: 10,
  reporter: 'Reporter A',
  responsibilityType: 'INTERNAL_DEPARTMENT',
  responsibleDepartment: 'Welding BU',
  responsibleDepartmentId: 'dept-welding',
  requestInfo: null,
  requestNo: 'REQ-001',
  status: 'PENDING',
  team: 'Resident Team',
  teamId: 'team-1',
  workOrderNumber: 'WO-1',
  workOrders: [],
  work_order: { projectName: 'Project A' },
};

const mockUserInfo = { id: 'user-1', username: 'admin' } as any;

describe('inspectionRequestCloseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DeptService.findActiveById).mockResolvedValue({
      businessUnit: null,
      id: 'dept-welding',
      name: 'Welding BU',
    });
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValue([
      { businessUnit: null, id: 'dept-welding', name: 'Welding BU' },
    ]);
    vi.mocked(
      TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds,
    ).mockResolvedValue(new Map([['team-1', ['dept-welding']]]));
    vi.mocked(prisma.inspections.findMany).mockResolvedValue([
      {
        supplierId: 'supplier-1',
        supplierName: 'Resident Team',
        team: 'Resident Team',
        teamId: 'team-1',
      },
    ] as never);
  });

  it('hydrates an outsourcing linked issue with the canonical close department', () => {
    expect(
      hydrateOutsourcingLinkedIssueResponsibility({
        linkedIssue: {
          responsibilityType: 'OUTSOURCING_UNIT',
          supplierId: 'supplier-outsourcing',
        },
        responsibility: { responsibleDepartmentId: 'dept-production' },
      }),
    ).toEqual({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-outsourcing',
    });
  });

  it('rejects a client-selected outsourcing linked issue department', () => {
    expect(() =>
      hydrateOutsourcingLinkedIssueResponsibility({
        linkedIssue: {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-client',
          supplierId: 'supplier-outsourcing',
        },
        responsibility: { responsibleDepartmentId: 'dept-production' },
      }),
    ).toThrow('外协责任部门由系统配置解析');
  });

  it('should close request with PASS result', async () => {
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      mockRequest,
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: null,
            linkedIssueNo: null,
            linkedIssueStatus: null,
          }),
          update: vi.fn().mockResolvedValue({
            ...mockRequest,
            status: 'CLOSED',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: {
          updateMany: vi.fn(),
        },
        inspections: {
          findMany: vi.fn().mockResolvedValue([
            {
              supplierId: 'supplier-1',
              teamId: 'team-1',
            },
          ]),
        },
      }),
    );

    const result = await InspectionRequestCloseService.closeRequest(
      {} as any,
      'req-1',
      {
        attachments: [{ name: 'f.pdf', url: 'http://example.com/f.pdf' }],
        closeRemark: 'All good',
        result: 'PASS',
        quantity: 10,
      },
      mockUserInfo,
    );

    expect(result).toBeDefined();
    expect(prisma.qms_inspection_requests.findFirst).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(
      MetricRefreshQueue.enqueueSupplierScoresForInspectionIdentities,
    ).toHaveBeenCalledWith(
      expect.any(Object),
      {
        supplierIds: ['supplier-1'],
        teamIds: ['team-1'],
      },
      'inspection-request.closed',
    );
    const { syncCloseAttachments } = await import(
      '~/modules/inspection/inspection-request-close-effects.service'
    );
    expect(syncCloseAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        selfCheckAttachments: mockRequest.attachments,
      }),
    );
  });

  it('should throw when request not found', async () => {
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(null);

    await expect(
      InspectionRequestCloseService.closeRequest(
        {} as any,
        'not-found',
        { result: 'PASS', attachments: [{ name: 'f.pdf', url: 'http://x' }] },
        mockUserInfo,
      ),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '报检任务不存在',
      httpStatus: 404,
    });
  });

  it('should throw when request already closed', async () => {
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue({
      ...mockRequest,
      status: 'CLOSED',
    });

    await expect(
      InspectionRequestCloseService.closeRequest(
        {} as any,
        'req-1',
        { result: 'PASS', attachments: [{ name: 'f.pdf', url: 'http://x' }] },
        mockUserInfo,
      ),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: '报检任务已检验完成',
    });
  });

  it('backfills a historical responsibility from the top-level PASS input', async () => {
    const historicalRequest = {
      ...mockRequest,
      responsibilityType: null,
      responsibleDepartment: null,
      responsibleDepartmentId: null,
      supplierId: null,
      supplierName: null,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      historicalRequest,
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: { findMany: vi.fn().mockResolvedValue([]) },
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: null,
            linkedIssueNo: null,
            linkedIssueStatus: null,
          }),
          update: vi.fn().mockResolvedValue({
            ...historicalRequest,
            status: 'CLOSED',
          }),
          updateMany,
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await InspectionRequestCloseService.closeRequest(
      {} as any,
      'req-1',
      {
        attachments: [
          { name: 'record.pdf', url: 'http://example.com/record.pdf' },
        ],
        responsibility: {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-welding',
        },
        result: 'PASS',
      },
      mockUserInfo,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-welding',
        }),
      }),
    );
  });

  it('propagates post-backfill failures so the enclosing transaction rolls back', async () => {
    const historicalRequest = {
      ...mockRequest,
      responsibilityType: null,
      responsibleDepartment: null,
      responsibleDepartmentId: null,
      supplierId: null,
      supplierName: null,
    };
    const requestUpdate = vi.fn();
    const { createCloseInspectionRecords } = await import(
      '~/modules/inspection/inspection-request-close-records.service'
    );
    vi.mocked(createCloseInspectionRecords).mockRejectedValueOnce(
      new Error('record write failed'),
    );
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      historicalRequest,
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: { findMany: vi.fn().mockResolvedValue([]) },
        qms_inspection_request_inspections: { createMany: vi.fn() },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: null,
            linkedIssueNo: null,
            linkedIssueStatus: null,
          }),
          update: requestUpdate,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await expect(
      InspectionRequestCloseService.closeRequest(
        {} as any,
        'req-1',
        {
          attachments: [
            { name: 'record.pdf', url: 'http://example.com/record.pdf' },
          ],
          responsibility: {
            responsibilityType: 'INTERNAL_DEPARTMENT',
            responsibleDepartmentId: 'dept-welding',
          },
          result: 'PASS',
        },
        mockUserInfo,
      ),
    ).rejects.toThrow('record write failed');
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it('revalidates responsibility against the transaction-locked TEAM snapshot', async () => {
    vi.mocked(DeptService.findActiveByIdsOrNames).mockResolvedValueOnce([]);
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      mockRequest,
    );
    const txCreateLinks = vi.fn();
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: { findMany: vi.fn().mockResolvedValue([]) },
        qms_inspection_request_inspections: { createMany: txCreateLinks },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: null,
            linkedIssueNo: null,
            linkedIssueStatus: null,
            teamId: 'team-changed-before-close',
          }),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await expect(
      InspectionRequestCloseService.closeRequest(
        {} as any,
        'req-1',
        {
          attachments: [
            { name: 'record.pdf', url: 'http://example.com/record.pdf' },
          ],
          result: 'PASS',
        },
        mockUserInfo,
      ),
    ).rejects.toMatchObject({
      code: 'INSPECTION_REQUEST_RESPONSIBILITY_POLICY_MISMATCH',
    });
    expect(txCreateLinks).not.toHaveBeenCalled();
  });

  it('projects request responsibility to an explicit inspection with no fact', async () => {
    const inspectionUpdate = vi.fn().mockResolvedValue({});
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      mockRequest,
    );
    (prisma.inspections.findFirst as any).mockResolvedValue({
      id: 'i-existing',
    });
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'i-existing',
            responsibilityType: null,
            responsibleDepartment: null,
            responsibleDepartmentId: null,
            supplierId: null,
            supplierName: null,
          }),
          findMany: vi.fn().mockResolvedValue([]),
          update: inspectionUpdate,
        },
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: null,
            linkedIssueNo: null,
            linkedIssueStatus: null,
          }),
          update: vi.fn().mockResolvedValue({
            ...mockRequest,
            status: 'CLOSED',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await InspectionRequestCloseService.closeRequest(
      {} as any,
      'req-1',
      {
        attachments: [{ name: 'f.pdf', url: 'http://example.com/f.pdf' }],
        inspectionId: 'i-existing',
        result: 'PASS',
      },
      mockUserInfo,
    );

    expect(inspectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: 'Welding BU',
          responsibleDepartmentId: 'dept-welding',
          supplierId: null,
          supplierName: null,
        }),
      }),
    );
  });

  it('reuses the already linked issue for a repeated FAIL close', async () => {
    const existingIssue = {
      id: 'issue-existing',
      nonConformanceNumber: 'NC-26KJ-019',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-welding',
      status: 'OPEN',
      supplierId: null,
    };
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue({
      ...mockRequest,
      linkedIssueId: existingIssue.id,
      linkedIssueNo: existingIssue.nonConformanceNumber,
      linkedIssueStatus: existingIssue.status,
    });
    const createIssue = await import(
      '~/modules/inspection/inspection-request-close-issue.service'
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: { findMany: vi.fn().mockResolvedValue([]) },
        quality_records: {
          findFirst: vi.fn().mockResolvedValue(existingIssue),
        },
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: existingIssue.id,
            linkedIssueNo: existingIssue.nonConformanceNumber,
            linkedIssueStatus: existingIssue.status,
          }),
          update: vi.fn().mockResolvedValue({
            ...mockRequest,
            linkedIssueId: existingIssue.id,
            linkedIssueNo: existingIssue.nonConformanceNumber,
            linkedIssueStatus: existingIssue.status,
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await InspectionRequestCloseService.closeRequest(
      {} as any,
      'req-1',
      { result: 'FAIL', unqualifiedQuantity: 1 },
      mockUserInfo,
    );

    expect(
      createIssue.buildCloseLinkedIssueCreateResult,
    ).not.toHaveBeenCalled();
  });

  it('rejects a repeated FAIL when the persisted linked issue responsibility differs', async () => {
    const existingIssue = {
      id: 'issue-existing',
      nonConformanceNumber: 'NC-26KJ-019',
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartmentId: 'dept-other',
      status: 'OPEN',
      supplierId: null,
    };
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue({
      ...mockRequest,
      linkedIssueId: existingIssue.id,
      linkedIssueNo: existingIssue.nonConformanceNumber,
      linkedIssueStatus: existingIssue.status,
    });
    const requestUpdate = vi.fn();
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        inspections: { findMany: vi.fn().mockResolvedValue([]) },
        quality_records: {
          findFirst: vi.fn().mockResolvedValue(existingIssue),
        },
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          findUnique: vi.fn().mockResolvedValue({
            linkedIssueId: existingIssue.id,
            linkedIssueNo: existingIssue.nonConformanceNumber,
            linkedIssueStatus: existingIssue.status,
          }),
          update: requestUpdate,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: { updateMany: vi.fn() },
      }),
    );

    await expect(
      InspectionRequestCloseService.closeRequest(
        {} as any,
        'req-1',
        { result: 'FAIL', unqualifiedQuantity: 1 },
        mockUserInfo,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
    expect(requestUpdate).not.toHaveBeenCalled();
  });
});
