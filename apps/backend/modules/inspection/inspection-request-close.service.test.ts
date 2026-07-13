import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestCloseService } from '~/modules/inspection/inspection-request-close.service';
import { eventBus } from '~/utils/event-bus';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
    },
    inspections: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/inspection/inspection-request-close.schema', async () => {
  const { BusinessError: BE } = await import('~/utils/business-error');
  return {
    failCloseRequest: (prefix: string, message: string) => {
      const map: Record<string, number> = {
        VALIDATION: 400,
        BAD_REQUEST: 400,
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

vi.mock(
  '~/modules/inspection/inspection-request-close-effects.service',
  () => ({
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
  requestInfo: null,
  requestNo: 'REQ-001',
  status: 'PENDING',
  team: 'Resident Team',
  workOrderNumber: 'WO-1',
  workOrders: [],
  work_order: { projectName: 'Project A' },
};

const mockUserInfo = { id: 'user-1', username: 'admin' } as any;

describe('inspectionRequestCloseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should close request with PASS result', async () => {
    const eventEmit = vi.spyOn(eventBus, 'emit');
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      mockRequest,
    );
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_request_inspections: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_inspection_requests: {
          update: vi.fn().mockResolvedValue({
            ...mockRequest,
            status: 'CLOSED',
          }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        qms_task_dispatches: {
          updateMany: vi.fn(),
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
    expect(eventEmit).toHaveBeenCalledWith('inspection_record.changed', {
      supplierNames: ['Resident Team'],
      teamNames: ['Resident Team'],
    });
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
});
