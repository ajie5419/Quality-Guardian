import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTaskDispatchErrorMessage,
  TaskDispatchService,
} from '~/modules/task-dispatch/task-dispatch.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn(() => ({ governed: true })),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    qms_task_dispatches: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    quality_plans: {
      findUnique: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('taskDispatchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation((callback: any) =>
      callback({
        qms_task_dispatches: {
          create: vi.fn().mockResolvedValue({ id: 'task-1' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );
  });

  it('maps known task dispatch errors to user-facing messages', () => {
    expect(getTaskDispatchErrorMessage('CURRENT_USER_NOT_FOUND')).toBe(
      '无法识别当前操作人身份',
    );
    expect(getTaskDispatchErrorMessage('ASSIGNEE_NOT_FOUND')).toBe(
      '受派人不存在',
    );
    expect(getTaskDispatchErrorMessage('ITP_PROJECT_NOT_FOUND')).toBe(
      '关联的 ITP 计划不存在，请刷新后重试',
    );
    expect(getTaskDispatchErrorMessage('LEVEL_TWO_PARENT_REQUIRED')).toBe(
      '二级任务必须提供父任务ID',
    );
    expect(getTaskDispatchErrorMessage('PARENT_NOT_FOUND')).toBe(
      '父任务不存在',
    );
    expect(getTaskDispatchErrorMessage('PARENT_LEVEL_INVALID')).toBe(
      '仅允许挂载到一级任务',
    );
    expect(getTaskDispatchErrorMessage('UNKNOWN')).toBeNull();
  });

  it('creates level-one dispatch task after validating current user and assignee', async () => {
    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });

    const result = await TaskDispatchService.create({
      body: {
        assigneeId: 'tom',
        title: 'Task A',
      },
      userinfo: { id: 'assignor-1', username: 'admin' },
    });

    expect(result).toEqual({ id: 'task-1' });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('creates level-two dispatch task and promotes pending parent to dispatched', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'child-1' });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    (prisma.$transaction as any).mockImplementationOnce((callback: any) =>
      callback({
        qms_task_dispatches: { create, updateMany },
      }),
    );
    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });
    (prisma.qms_task_dispatches.findUnique as any).mockResolvedValueOnce({
      level: 1,
    });

    await TaskDispatchService.create({
      body: {
        assigneeId: 'assignee-1',
        level: 2,
        parentId: 'parent-1',
        title: 'Child task',
      },
      userinfo: { id: 'assignor-1' },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'parent-1', status: 'PENDING' },
      data: { status: 'DISPATCHED' },
    });
  });

  it('rejects invalid create inputs before writing', async () => {
    await expect(
      TaskDispatchService.create({
        body: { assigneeId: 'u2' },
        userinfo: {},
      }),
    ).rejects.toThrow('CURRENT_USER_NOT_FOUND');

    vi.clearAllMocks();
    (prisma.users.findFirst as any).mockResolvedValueOnce({ id: 'assignor-1' });

    await expect(
      TaskDispatchService.create({
        body: { assigneeId: '' },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('ASSIGNEE_NOT_FOUND');

    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce(null);

    await expect(
      TaskDispatchService.create({
        body: { assigneeId: 'missing' },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('ASSIGNEE_NOT_FOUND');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing ITP project and invalid level-two parent', async () => {
    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });
    (prisma.quality_plans.findUnique as any).mockResolvedValueOnce(null);

    await expect(
      TaskDispatchService.create({
        body: {
          assigneeId: 'assignee-1',
          itpProjectId: 'itp-1',
          type: 'ITP_INSPECTION',
        },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('ITP_PROJECT_NOT_FOUND');

    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });

    await expect(
      TaskDispatchService.create({
        body: { assigneeId: 'assignee-1', level: 2 },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('LEVEL_TWO_PARENT_REQUIRED');

    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });
    (prisma.qms_task_dispatches.findUnique as any).mockResolvedValueOnce(null);

    await expect(
      TaskDispatchService.create({
        body: { assigneeId: 'assignee-1', level: 2, parentId: 'parent-1' },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('PARENT_NOT_FOUND');

    (prisma.users.findFirst as any)
      .mockResolvedValueOnce({ id: 'assignor-1' })
      .mockResolvedValueOnce({ id: 'assignee-1' });
    (prisma.qms_task_dispatches.findUnique as any).mockResolvedValueOnce({
      level: 2,
    });

    await expect(
      TaskDispatchService.create({
        body: { assigneeId: 'assignee-1', level: 2, parentId: 'parent-1' },
        userinfo: { id: 'assignor-1' },
      }),
    ).rejects.toThrow('PARENT_LEVEL_INVALID');
  });

  it('lists tasks with assignee/assignor display names and archive filter', async () => {
    (prisma.users.findFirst as any).mockResolvedValueOnce({ id: 'user-1' });
    (prisma.qms_task_dispatches.findMany as any).mockResolvedValueOnce([
      {
        assigneeId: 'assignee-1',
        assignorId: 'assignor-1',
        id: 'task-1',
        users_qms_task_dispatches_assigneeIdTousers: { realName: 'Tom' },
        users_qms_task_dispatches_assignorIdTousers: { realName: 'Admin' },
      },
      {
        assigneeId: 'assignee-2',
        assignorId: 'assignor-2',
        id: 'task-2',
        users_qms_task_dispatches_assigneeIdTousers: null,
        users_qms_task_dispatches_assignorIdTousers: null,
      },
    ]);

    const result = await TaskDispatchService.list({
      all: 'true',
      level: 1,
      parentId: '',
      roles: ['admin'],
      status: 'pending',
      userinfo: { id: 'user-1', roles: ['admin'] },
    } as any);

    expect(result).toEqual([
      expect.objectContaining({
        assigneeName: 'Tom',
        assignorName: 'Admin',
        id: 'task-1',
      }),
      expect.objectContaining({
        assigneeName: 'assignee-2',
        assignorName: 'assignor-2',
        id: 'task-2',
      }),
    ]);
    expect(prisma.qms_task_dispatches.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { itpProjectId: null },
              { itp_project: { planStatus: { not: 'ARCHIVED' } } },
            ],
          },
          {
            OR: [
              { dfmeaId: null },
              { dfmea_project: { status: { not: 'archived' } } },
            ],
          },
        ],
        level: 1,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        users_qms_task_dispatches_assignorIdTousers: true,
        users_qms_task_dispatches_assigneeIdTousers: true,
        itp_project: true,
        dfmea_project: true,
      },
    });
  });

  it('seeds demo tasks from first available user and rejects empty user list', async () => {
    (prisma.users.findMany as any).mockResolvedValueOnce([]);

    await expect(TaskDispatchService.seed()).rejects.toThrow('NO_USERS');

    (prisma.users.findMany as any).mockResolvedValueOnce([{ id: 'admin-1' }]);
    (prisma.qms_task_dispatches.createMany as any).mockResolvedValueOnce({
      count: 2,
    });

    await TaskDispatchService.seed();

    expect(prisma.qms_task_dispatches.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          assigneeId: 'admin-1',
          assignorId: 'admin-1',
          governed: true,
          status: 'PENDING',
        }),
      ]),
    });
  });

  it('returns stats for current user and updates task status', async () => {
    (prisma.users.findFirst as any).mockResolvedValueOnce({ id: 'user-1' });
    (prisma.qms_task_dispatches.count as any)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    await expect(TaskDispatchService.stats({ id: 'user-1' })).resolves.toEqual({
      overdue: 0,
      pendingLevel1: 2,
      pendingLevel2: 3,
      processing: 4,
    });

    await TaskDispatchService.updateStatus('task-1', 'DONE');

    expect(prisma.qms_task_dispatches.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'DONE', updatedAt: expect.any(Date) },
    });
  });
});
