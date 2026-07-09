import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
    qms_task_dispatches: {
      create: vi.fn(),
      updateMany: vi.fn(),
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

vi.mock('~/modules/inspection/inspection-request', () => ({
  INSPECTION_REQUEST_STATUS: {
    CLOSED: 'CLOSED',
    DISPATCHED: 'DISPATCHED',
    INSPECTING: 'INSPECTING',
    SUBMITTED: 'SUBMITTED',
  },
  mapInspectionRequest: vi.fn().mockImplementation((r) => r),
  normalizeInspectionRequestText: vi.fn().mockImplementation((v) => {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }),
  parseInspectionRequestPriority: vi
    .fn()
    .mockImplementation((v, fallback = 3) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }),
  resolveInspectionRequestCurrentUserId: vi.fn().mockResolvedValue('admin-1'),
}));

const event = {} as any;
const userinfo = { id: 'admin-1', userId: 'admin-1', username: 'admin' } as any;

function makeSubmittedRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    requestNo: 'IR-20260612-001',
    status: 'SUBMITTED',
    updatedAt: new Date('2026-06-12T08:00:00.000Z'),
    workOrderNumber: 'WO-1',
    work_order: { projectName: 'Project Alpha' },
    ...overrides,
  } as never;
}

function makeInspector(id = 'inspector-1') {
  return { id, username: 'inspector_user' } as never;
}

function setupTransactionMocks(
  overrides: {
    taskCreateResult?: unknown;
    taskUpdateManyCount?: number;
    updateManyCount?: number;
    updateResult?: unknown;
  } = {},
) {
  const tx = {
    qms_inspection_requests: {
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides.updateManyCount ?? 1 }),
      update: vi.fn().mockResolvedValue(
        overrides.updateResult ?? {
          id: 'req-1',
          requestNo: 'IR-20260612-001',
          status: 'DISPATCHED',
          dispatcher: { realName: 'Admin', username: 'admin' },
          inspector: { realName: 'Inspector', username: 'inspector_user' },
          process: { name: 'Welding' },
        },
      ),
    },
    qms_task_dispatches: {
      create: vi
        .fn()
        .mockResolvedValue(overrides.taskCreateResult ?? { id: 'task-1' }),
      updateMany: vi
        .fn()
        .mockResolvedValue({ count: overrides.taskUpdateManyCount ?? 1 }),
    },
  };
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(tx));
  return tx;
}

describe('adversarial: dispatchRequest state machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findFirst).mockResolvedValue(makeInspector());
  });

  it('1. dispatches a SUBMITTED request successfully (baseline)', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
    const tx = setupTransactionMocks();

    const result = await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(result).toBeDefined();
    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'req-1',
          status: { in: ['SUBMITTED', 'DISPATCHED'] },
        }),
        data: expect.objectContaining({ status: 'DISPATCHED' }),
      }),
    );
    expect(tx.qms_task_dispatches.create).toHaveBeenCalledTimes(1);
  });

  it('2. rejects dispatch when request is CLOSED', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest({ status: 'CLOSED' }),
    );

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

  it('3. rejects dispatch when request is INSPECTING', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest({ status: 'INSPECTING' }),
    );

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

  it('4. reassigns a DISPATCHED request by updating the existing dispatch task', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest({
        dispatchTaskId: 'task-1',
        status: 'DISPATCHED',
      }),
    );
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1', priority: 2 },
      userinfo,
    );

    expect(tx.qms_task_dispatches.create).not.toHaveBeenCalled();
    expect(tx.qms_task_dispatches.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigneeId: 'inspector-1',
        priority: 2,
        status: 'DISPATCHED',
      }),
      where: { id: 'task-1', status: 'DISPATCHED' },
    });
    expect(tx.qms_inspection_requests.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dispatchTaskId: 'task-1' },
      }),
    );
  });

  it('5. rejects reassign when the linked dispatch task is already processing', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest({
        dispatchTaskId: 'task-1',
        status: 'DISPATCHED',
      }),
    );
    const tx = setupTransactionMocks({ taskUpdateManyCount: 0 });

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('关联派单任务已开始处理，不能改派');

    expect(tx.qms_task_dispatches.create).not.toHaveBeenCalled();
    expect(tx.qms_inspection_requests.update).not.toHaveBeenCalled();
  });

  it('6. race condition: second dispatch fails when updateMany returns count=0', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
    const tx = setupTransactionMocks({ updateManyCount: 0 });

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
});

describe('adversarial: dispatchRequest input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findFirst).mockResolvedValue(makeInspector());
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
  });

  it('6. rejects when inspectorId is empty string', async () => {
    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: '' },
        userinfo,
      ),
    ).rejects.toThrow('检验员不能为空');
  });

  it('7. rejects when inspectorId is null', async () => {
    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: null },
        userinfo,
      ),
    ).rejects.toThrow('检验员不能为空');
  });

  it('8. rejects when inspectorId is missing entirely', async () => {
    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        {},
        userinfo,
      ),
    ).rejects.toThrow('检验员不能为空');
  });

  it('9. rejects when inspector does not exist in DB', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue(null as never);

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'nonexistent' },
        userinfo,
      ),
    ).rejects.toThrow('检验员不存在');
  });

  it('10. rejects when request does not exist', async () => {
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      null as never,
    );

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('报检任务不存在');
  });
});

describe('adversarial: dispatchRequest permission checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findFirst).mockResolvedValue(makeInspector());
  });

  it('11. rejects when user lacks dispatch permission', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Requests:View',
    ]);

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('无派单权限');

    expect(prisma.qms_inspection_requests.findFirst).not.toHaveBeenCalled();
  });

  it('12. allows dispatch when user has correct permission', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
    setupTransactionMocks();

    const result = await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(result).toBeDefined();
  });

  it('13. rejects when permission codes list is empty', async () => {
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([]);

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('无派单权限');
  });
});

describe('adversarial: dispatchRequest edge cases', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { RbacService } = await import('~/modules/rbac/rbac.service');
    vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValue([
      'QMS:Inspection:Requests:Dispatch',
    ]);
    const { resolveInspectionRequestCurrentUserId } = await import(
      '~/modules/inspection/inspection-request'
    );
    vi.mocked(resolveInspectionRequestCurrentUserId).mockResolvedValue(
      'admin-1',
    );
    vi.mocked(prisma.users.findFirst).mockResolvedValue(makeInspector());
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
  });

  it('14. uses default priority (3) when priority is undefined', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 3 }),
      }),
    );
  });

  it('15. uses priority 0 when explicitly provided (edge boundary)', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1', priority: 0 },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 0 }),
      }),
    );
  });

  it('16. sets dispatchRemark to null when empty string', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1', dispatchRemark: '' },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispatchRemark: null }),
      }),
    );
  });

  it('17. resolves inspectorId via username lookup', async () => {
    vi.mocked(prisma.users.findFirst).mockResolvedValue({
      id: 'inspector-42',
      username: 'john_doe',
    } as never);
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'john_doe' },
      userinfo,
    );

    expect(prisma.users.findFirst).toHaveBeenCalledWith({
      select: { id: true, wxOpenId: true },
      where: { OR: [{ id: 'john_doe' }, { username: 'john_doe' }] },
    });
    expect(tx.qms_task_dispatches.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: 'inspector-42' }),
      }),
    );
  });

  it('18. sets dispatcherId from current user session', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispatcherId: 'admin-1' }),
      }),
    );
  });

  it('19. rejects when resolveInspectionRequestCurrentUserId returns null', async () => {
    const { resolveInspectionRequestCurrentUserId } = await import(
      '~/modules/inspection/inspection-request'
    );
    vi.mocked(resolveInspectionRequestCurrentUserId).mockResolvedValue(null);

    await expect(
      InspectionRequestDispatchService.dispatchRequest(
        event,
        'req-1',
        { inspectorId: 'inspector-1' },
        userinfo,
      ),
    ).rejects.toThrow('无法识别当前调度人');
  });

  it('20. passes high priority through to dispatch task', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1', priority: 1 },
      userinfo,
    );

    expect(tx.qms_task_dispatches.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ priority: 1 }),
      }),
    );
  });

  it('21. records audit log after successful dispatch', async () => {
    const { recordBusinessAuditLog } = await import(
      '~/modules/system-log/audit-log'
    );
    vi.mocked(prisma.qms_inspection_requests.findFirst).mockResolvedValue(
      makeSubmittedRequest(),
    );
    setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    expect(recordBusinessAuditLog).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        action: 'UPDATE',
        targetId: 'req-1',
        targetType: 'inspection_request',
      }),
    );
  });

  it('22. dispatchRemark with non-empty value is passed through', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1', dispatchRemark: 'Please hurry' },
      userinfo,
    );

    expect(tx.qms_inspection_requests.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dispatchRemark: 'Please hurry' }),
      }),
    );
  });

  it('23. sets dispatchedAt to a Date in the transaction', async () => {
    const tx = setupTransactionMocks();

    await InspectionRequestDispatchService.dispatchRequest(
      event,
      'req-1',
      { inspectorId: 'inspector-1' },
      userinfo,
    );

    const updateData = tx.qms_inspection_requests.updateMany.mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(updateData.dispatchedAt).toBeInstanceOf(Date);
  });
});
