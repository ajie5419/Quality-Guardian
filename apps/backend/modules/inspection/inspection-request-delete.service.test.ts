import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestDeleteService } from '~/modules/inspection/inspection-request-delete.service';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    qms_task_dispatches: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/business-error', () => ({
  BusinessError: class BusinessError extends Error {
    code: string;
    httpStatus: number;
    constructor(code: string, message: string, httpStatus = 400) {
      super(message);
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserPermissionCodes: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('~/modules/inspection/inspection-request', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('~/modules/inspection/inspection-request')
    >();
  return {
    ...original,
    resolveInspectionRequestCurrentUserId: vi.fn().mockResolvedValue('user-1'),
  };
});

const event = {} as any;

const ownerUserinfo = { id: 'user-1', username: 'alice', roles: [] } as any;
const otherUserinfo = {
  id: 'user-2',
  userId: 'user-2',
  username: 'bob',
  roles: [],
} as any;

function makeExisting(overrides: Record<string, unknown> = {}) {
  return {
    dispatchTaskId: null,
    id: 'req-1',
    reporter: 'alice',
    requestNo: 'REQ-001',
    ...overrides,
  };
}

function setupTransaction(updateManyResult: { count: number }) {
  const txUpdateMany = vi.fn().mockResolvedValue(updateManyResult);
  const txDispatchUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) =>
    cb({
      qms_inspection_requests: { updateMany: txUpdateMany },
      qms_task_dispatches: { updateMany: txDispatchUpdateMany },
    }),
  );
  return { txUpdateMany, txDispatchUpdateMany };
}

describe('inspectionRequestDeleteService.deleteRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // (a) Status guard: INSPECTING / CLOSED should be rejected
  it('rejects cancellation when request is in INSPECTING status', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ reporter: 'alice' }) as any,
    );
    // Transaction returns count=0 simulating that status was INSPECTING
    setupTransaction({ count: 0 });

    await expect(
      InspectionRequestDeleteService.deleteRequest(
        event,
        'req-1',
        ownerUserinfo,
      ),
    ).rejects.toThrow('报检任务当前状态不可取消');
  });

  it('rejects cancellation when request is in CLOSED status (atomic guard returns count=0)', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ reporter: 'alice' }) as any,
    );
    setupTransaction({ count: 0 });

    await expect(
      InspectionRequestDeleteService.deleteRequest(
        event,
        'req-1',
        ownerUserinfo,
      ),
    ).rejects.toThrow('报检任务当前状态不可取消');
  });

  // (b) Atomic guard shape: updateMany where must include status filter + isDeleted:false
  it('passes status filter and isDeleted:false to updateMany inside transaction', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting() as any,
    );
    const { txUpdateMany } = setupTransaction({ count: 1 });

    await InspectionRequestDeleteService.deleteRequest(
      event,
      'req-1',
      ownerUserinfo,
    );

    expect(txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'req-1',
          isDeleted: false,
          status: {
            in: expect.arrayContaining(['SUBMITTED', 'DISPATCHED']),
          },
        }),
      }),
    );
  });

  // (c) Non-owner without dispatch role rejects
  it('rejects when caller is not the owner and lacks dispatch permission', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ reporter: 'alice' }) as any,
    );

    await expect(
      InspectionRequestDeleteService.deleteRequest(
        event,
        'req-1',
        otherUserinfo,
      ),
    ).rejects.toThrow('无权取消他人的报检任务');

    // Transaction must not be called when ownership/auth check fails early
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows non-owner with dispatch permission to cancel', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ reporter: 'alice' }) as any,
    );
    setupTransaction({ count: 1 });

    await expect(
      InspectionRequestDeleteService.deleteRequest(
        event,
        'req-1',
        otherUserinfo,
      ),
    ).resolves.toBeUndefined();
  });

  // (d) Owner succeeds and status written is the CANCELLED constant
  it('owner succeeds and writes status CANCELLED from the enum constant', async () => {
    const { INSPECTION_REQUEST_STATUS } = await import(
      '~/modules/inspection/inspection-request'
    );
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ reporter: 'alice' }) as any,
    );
    const { txUpdateMany } = setupTransaction({ count: 1 });

    await InspectionRequestDeleteService.deleteRequest(
      event,
      'req-1',
      ownerUserinfo,
    );

    expect(txUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: INSPECTION_REQUEST_STATUS.CANCELLED,
          isDeleted: true,
        }),
      }),
    );
  });

  it('cancels dispatch task row when dispatchTaskId is set', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ dispatchTaskId: 'task-1', reporter: 'alice' }) as any,
    );
    const { txDispatchUpdateMany } = setupTransaction({ count: 1 });

    await InspectionRequestDeleteService.deleteRequest(
      event,
      'req-1',
      ownerUserinfo,
    );

    expect(txDispatchUpdateMany).toHaveBeenCalledWith({
      data: { status: 'CANCELLED' },
      where: { id: 'task-1' },
    });
  });

  it('skips dispatch cancellation when dispatchTaskId is null', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeExisting({ dispatchTaskId: null, reporter: 'alice' }) as any,
    );
    const { txDispatchUpdateMany } = setupTransaction({ count: 1 });

    await InspectionRequestDeleteService.deleteRequest(
      event,
      'req-1',
      ownerUserinfo,
    );

    expect(txDispatchUpdateMany).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when request does not exist', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(null);

    const error_ = await InspectionRequestDeleteService.deleteRequest(
      event,
      'not-found',
      ownerUserinfo,
    ).catch((error_: unknown) => error_);

    expect(error_).toBeInstanceOf(BusinessError);
    expect((error_ as InstanceType<typeof BusinessError>).httpStatus).toBe(404);
  });
});
