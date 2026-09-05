import type { AccessScope } from '~/modules/data-scope';

import { createScopedRepository, DataScopeService } from '~/modules/data-scope';
import {
  buildTaskDispatchCreateData,
  getTaskDispatchArchiveFilter,
  resolveTaskDispatchAssigneeFilter,
  resolveTaskDispatchCurrentUserId,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchParentIdForPromotion,
  resolveTaskDispatchStatusFilter,
  TASK_DISPATCH_STATUS,
} from '~/modules/task-dispatch/task-dispatch-rules';
import { assertTaskDispatchTransition } from '~/modules/task-dispatch/task-dispatch-state';
import { BusinessError } from '~/utils/business-error';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import prisma from '~/utils/prisma';

export function getTaskDispatchErrorMessage(message: string) {
  if (message === 'CURRENT_USER_NOT_FOUND') return '无法识别当前操作人身份';
  if (message === 'ASSIGNEE_NOT_FOUND') return '受派人不存在';
  if (message === 'ITP_PROJECT_NOT_FOUND')
    return '关联的 ITP 计划不存在，请刷新后重试';
  if (message === 'LEVEL_TWO_PARENT_REQUIRED')
    return '二级任务必须提供父任务ID';
  if (message === 'PARENT_NOT_FOUND') return '父任务不存在';
  if (message === 'PARENT_LEVEL_INVALID') return '仅允许挂载到一级任务';
  return null;
}

function buildTaskDispatchAccess(
  userId: string,
  userinfo: { username?: string },
  scope?: AccessScope,
) {
  return {
    scope,
    user: { id: userId, username: userinfo.username },
  };
}

export const TaskDispatchService = {
  async create(input: {
    body: Record<string, unknown>;
    scope?: AccessScope;
    userinfo: {
      id?: number | string;
      userId?: number | string;
      username?: string;
    };
  }) {
    const currentUserId = await resolveTaskDispatchCurrentUserId(
      input.userinfo,
      prisma,
    );
    if (!currentUserId) throw new Error('CURRENT_USER_NOT_FOUND');
    const access = buildTaskDispatchAccess(
      currentUserId,
      input.userinfo,
      input.scope,
    );
    const assigneeId = String(input.body.assigneeId || '').trim();
    if (!assigneeId) throw new Error('ASSIGNEE_NOT_FOUND');
    const assignee = await prisma.users.findFirst({
      where: { OR: [{ id: assigneeId }, { username: assigneeId }] },
      select: { id: true },
    });
    if (!assignee) throw new Error('ASSIGNEE_NOT_FOUND');
    const itpProjectId = resolveTaskDispatchItpProjectIdForValidation(
      input.body,
    );
    if (itpProjectId) {
      const project = await prisma.quality_plans.findUnique({
        where: { id: itpProjectId },
      });
      if (!project) throw new Error('ITP_PROJECT_NOT_FOUND');
    }
    const parentId = resolveTaskDispatchParentIdForPromotion(input.body);
    if (Number(input.body.level) === 2 && !parentId) {
      throw new Error('LEVEL_TWO_PARENT_REQUIRED');
    }
    return prisma.$transaction(async (tx) => {
      const scopedTasks = createScopedRepository(
        'task-dispatch',
        tx.qms_task_dispatches,
      );
      if (parentId) {
        const parentTask = await scopedTasks.findAccessible(
          {
            where: { id: parentId },
            select: { id: true, level: true },
          },
          access,
        );
        if (!parentTask) {
          throw new BusinessError('NOT_FOUND', '父任务不存在', 404);
        }
        if (parentTask.level !== 1) {
          throw new Error('PARENT_LEVEL_INVALID');
        }
        const promotion = await scopedTasks.updateAccessible(
          {
            where: { id: parentId, status: TASK_DISPATCH_STATUS.PENDING },
            data: { status: TASK_DISPATCH_STATUS.DISPATCHED },
          },
          access,
        );
        if (promotion.count !== 1) {
          const freshParent = await scopedTasks.findAccessible(
            {
              where: { id: parentId },
              select: { id: true },
            },
            access,
          );
          if (!freshParent) {
            throw new BusinessError('NOT_FOUND', '父任务不存在', 404);
          }
          throw new BusinessError(
            'CONFLICT',
            '父任务状态已变化，请刷新后重试',
            409,
          );
        }
      }
      const base = buildTaskDispatchCreateData(input.body, {
        assigneeId: assignee.id,
        assignorId: currentUserId,
      });
      const created = await tx.qms_task_dispatches.create({
        data: {
          ...base,
          ...buildGovernedWriteFieldsForTable('qms_task_dispatches', base),
        },
      });
      return created;
    });
  },
  async list(input: {
    all?: string;
    level?: number;
    parentId?: string;
    scope?: AccessScope;
    status?: string;
    userinfo: {
      id?: number | string;
      roles?: string[];
      userId?: number | string;
      username?: string;
    };
  }) {
    const currentUserId = await resolveTaskDispatchCurrentUserId(
      input.userinfo,
      prisma,
    );
    if (!currentUserId) throw new Error('CURRENT_USER_NOT_FOUND');
    const statusFilter = resolveTaskDispatchStatusFilter(input.status);
    const assigneeFilter = resolveTaskDispatchAssigneeFilter({
      all: input.all,
      currentUserId,
      isAdmin:
        input.userinfo.roles?.includes('super') ||
        input.userinfo.roles?.includes('admin') ||
        false,
      parentId: input.parentId,
    });
    const where = await DataScopeService.buildScopedWhere(
      'task-dispatch',
      {
        ...assigneeFilter,
        ...(input.level ? { level: input.level } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...getTaskDispatchArchiveFilter(),
      },
      { userId: currentUserId, username: input.userinfo.username },
      input.scope,
    );
    const tasks = await prisma.qms_task_dispatches.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        users_qms_task_dispatches_assignorIdTousers: true,
        users_qms_task_dispatches_assigneeIdTousers: true,
        itp_project: true,
        dfmea_project: true,
      },
    });
    return tasks.map((t) => ({
      ...t,
      assigneeName:
        t.users_qms_task_dispatches_assigneeIdTousers?.realName || t.assigneeId,
      assignorName:
        t.users_qms_task_dispatches_assignorIdTousers?.realName || t.assignorId,
    }));
  },
  async seed() {
    const users = await prisma.users.findMany({ take: 3 });
    if (users.length === 0) throw new Error('NO_USERS');
    const admin = users[0];
    await prisma.qms_task_dispatches.createMany({
      data: [
        {
          type: 'ITP_INSPECTION',
          title: '2026年度桥梁支座组焊 ITP 项目检验',
          level: 1,
          assignorId: String(admin.id),
          assigneeId: String(admin.id),
          priority: 3,
          status: 'PENDING',
          itpProjectId: 'ITP-PRJ-001',
          dueDate: new Date('2026-06-30'),
          updatedAt: new Date(),
        },
        {
          type: 'DFMEA_ACTION',
          title: 'DFMEA-202601: 传动轴振动失效改进措施执行',
          level: 1,
          assignorId: String(admin.id),
          assigneeId: String(admin.id),
          priority: 2,
          status: 'PENDING',
          dfmeaId: 'DFM-001',
          dueDate: new Date('2026-03-15'),
          updatedAt: new Date(),
        },
      ].map((it) => ({
        ...it,
        ...buildGovernedWriteFieldsForTable('qms_task_dispatches', it),
      })),
    });
  },
  async stats(userinfo: {
    id?: number | string;
    userId?: number | string;
    username?: string;
  }) {
    const currentUserId = await resolveTaskDispatchCurrentUserId(
      userinfo,
      prisma,
    );
    if (!currentUserId) throw new Error('CURRENT_USER_NOT_FOUND');
    const archiveFilter = getTaskDispatchArchiveFilter();
    const [pendingLevel1, pendingLevel2, processing] = await Promise.all([
      prisma.qms_task_dispatches.count({
        where: {
          assigneeId: currentUserId,
          level: 1,
          status: TASK_DISPATCH_STATUS.PENDING,
          ...archiveFilter,
        },
      }),
      prisma.qms_task_dispatches.count({
        where: {
          assigneeId: currentUserId,
          level: 2,
          status: TASK_DISPATCH_STATUS.PENDING,
          ...archiveFilter,
        },
      }),
      prisma.qms_task_dispatches.count({
        where: {
          assigneeId: currentUserId,
          status: TASK_DISPATCH_STATUS.PROCESSING,
          ...archiveFilter,
        },
      }),
    ]);
    return { overdue: 0, pendingLevel1, pendingLevel2, processing };
  },
  async updateStatus(
    id: string,
    status: string,
    userinfo: {
      id?: number | string;
      userId?: number | string;
      username?: string;
    },
    scope?: AccessScope,
  ) {
    const currentUserId = await resolveTaskDispatchCurrentUserId(
      userinfo,
      prisma,
    );
    if (!currentUserId) {
      throw new BusinessError('FORBIDDEN', '无法识别当前操作人身份', 403);
    }
    const repo = createScopedRepository(
      'task-dispatch',
      prisma.qms_task_dispatches,
    );
    const access = buildTaskDispatchAccess(currentUserId, userinfo, scope);
    const current = await repo.findAccessible(
      {
        where: { id },
        select: { id: true, status: true },
      },
      access,
    );
    if (!current) {
      throw new BusinessError('NOT_FOUND', '任务不存在', 404);
    }
    assertTaskDispatchTransition(current.status, status);
    const result = await repo.updateAccessible(
      {
        where: { id, status: current.status },
        data: { status, updatedAt: new Date() },
      },
      access,
    );
    if (result.count !== 1) {
      const fresh = await repo.findAccessible(
        {
          where: { id },
          select: { id: true, status: true },
        },
        access,
      );
      if (!fresh) {
        throw new BusinessError('NOT_FOUND', '任务不存在', 404);
      }
      throw new BusinessError('CONFLICT', '任务状态已变化，请刷新后重试', 409);
    }
    const updated = await repo.findAccessible(
      {
        where: { id },
        select: { id: true, status: true, updatedAt: true },
      },
      access,
    );
    return updated ?? { id, status };
  },
};
