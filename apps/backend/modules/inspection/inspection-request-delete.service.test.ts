import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestDeleteService } from '~/modules/inspection/inspection-request-delete.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
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
    statusCode: number;
    constructor(code: string, message: string, statusCode: number) {
      super(`${code}:${message}`);
      this.statusCode = statusCode;
    }
  },
}));

describe('inspectionRequestDeleteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should soft delete request and cancel dispatch task', async () => {
    const { FileStorageService } = await import(
      '~/modules/file-storage/file-storage.service'
    );
    const existing = {
      dispatchTaskId: 'dispatch-1',
      id: 'req-1',
      requestNo: 'REQ-001',
    };
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      existing,
    );
    const txUpdate = vi.fn().mockResolvedValue({});
    const txUpdateMany = vi.fn().mockResolvedValue({});
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: { update: txUpdate },
        qms_task_dispatches: { updateMany: txUpdateMany },
      }),
    );

    await InspectionRequestDeleteService.deleteRequest({} as any, 'req-1', {
      id: 'user-1',
    } as any);

    expect(txUpdate).toHaveBeenCalledWith({
      data: { isDeleted: true, updatedAt: expect.any(Date) },
      where: { id: 'req-1' },
    });
    expect(txUpdateMany).toHaveBeenCalledWith({
      data: { status: 'CANCELLED' },
      where: { id: 'dispatch-1' },
    });
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'req-1',
      bizType: 'inspection_request',
    });
  });

  it('should throw when request not found', async () => {
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(null);

    await expect(
      InspectionRequestDeleteService.deleteRequest({} as any, 'not-found', {
        id: 'user-1',
      } as any),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('should not cancel dispatch task when dispatchTaskId is null', async () => {
    const existing = {
      dispatchTaskId: null,
      id: 'req-1',
      requestNo: 'REQ-001',
    };
    (prisma.qms_inspection_requests.findFirst as any).mockResolvedValue(
      existing,
    );
    const txUpdateMany = vi.fn();
    (prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        qms_inspection_requests: { update: vi.fn() },
        qms_task_dispatches: { updateMany: txUpdateMany },
      }),
    );

    await InspectionRequestDeleteService.deleteRequest({} as any, 'req-1', {
      id: 'user-1',
    } as any);

    expect(txUpdateMany).not.toHaveBeenCalled();
  });
});
