import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import { WxSubscribeMessageService } from '~/modules/user';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    qms_task_dispatches: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    getUserPermissionCodes: vi
      .fn()
      .mockResolvedValue(['QMS:Inspection:Requests:Dispatch']),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/user', () => ({
  WxSubscribeMessageService: {
    sendDispatchAssigned: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: () => ({}),
}));

const userinfo = { id: 'admin-1', userId: 'admin-1', username: 'admin' } as any;
const event = {} as any;

describe('inspectionRequestDispatchService.dispatchRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'inspector-1',
      wxOpenId: 'openid-1',
    } as never);
  });

  it('rejects dispatch when the request is already closed', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      id: 'req-1',
      status: 'CLOSED',
    } as never);

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('该报检任务当前状态不可派单或改派，请刷新后重试');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects inside the transaction when a concurrent dispatch already won', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      id: 'req-1',
      work_order: { projectName: 'Project A' },
      status: 'SUBMITTED',
      requestNo: 'IR-1',
      updatedAt: new Date('2026-06-12T08:00:00.000Z'),
      workOrderNumber: 'WO-1',
    } as never);

    const tx = {
      qms_inspection_requests: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
      qms_task_dispatches: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('该报检任务状态已变化，请刷新后重试');

    expect(tx.qms_task_dispatches.create).not.toHaveBeenCalled();
    expect(tx.qms_inspection_requests.update).not.toHaveBeenCalled();
  });

  it('creates the dispatch record only after winning the conditional update', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue({
      id: 'req-1',
      status: 'SUBMITTED',
      requestNo: 'IR-1',
      work_order: { projectName: 'Project A' },
      updatedAt: new Date('2026-06-12T08:00:00.000Z'),
      workOrderNumber: 'WO-1',
    } as never);

    const tx = {
      qms_inspection_requests: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({
          dispatcher: { realName: 'Dispatcher', username: 'dispatcher' },
          id: 'req-1',
          partName: 'Part A',
          requestNo: 'IR-1',
          status: 'DISPATCHED',
          workOrderNumber: 'WO-1',
        }),
      },
      qms_task_dispatches: {
        create: vi.fn().mockResolvedValue({ id: 'task-1' }),
        updateMany: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'req-1',
          status: { in: ['SUBMITTED', 'DISPATCHED'] },
        }),
      }),
    );
    expect(tx.qms_task_dispatches.create).toHaveBeenCalledTimes(1);
    expect(tx.qms_inspection_requests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dispatchTaskId: 'task-1' },
        where: { id: 'req-1' },
      }),
    );
    expect(WxSubscribeMessageService.sendDispatchAssigned).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatcher: 'Dispatcher',
        openid: 'openid-1',
        partName: 'Part A',
        projectName: 'Project A',
        requestNo: 'IR-1',
        workOrderNumber: 'WO-1',
      }),
    );
  });
});
