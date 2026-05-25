import { buildGovernedWriteFieldsForTable } from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import {
  buildTaskDispatchCreateData,
  getTaskDispatchArchiveFilter,
  resolveTaskDispatchAssigneeFilter,
  resolveTaskDispatchCurrentUserId,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchParentIdForPromotion,
  resolveTaskDispatchStatusFilter,
  TASK_DISPATCH_STATUS,
} from '~/utils/task-dispatch';

export function getTaskDispatchErrorMessage(message: string) {
  if (message === 'CURRENT_USER_NOT_FOUND') return '无法识别当前操作人身份';
  if (message === 'ASSIGNEE_NOT_FOUND') return '受派人不存在';
  if (message === 'ITP_PROJECT_NOT_FOUND') return '关联的 ITP 计划不存在，请刷新后重试';
  if (message === 'LEVEL_TWO_PARENT_REQUIRED') return '二级任务必须提供父任务ID';
  if (message === 'PARENT_NOT_FOUND') return '父任务不存在';
  if (message === 'PARENT_LEVEL_INVALID') return '仅允许挂载到一级任务';
  return null;
}

export const TaskDispatchService = {
  async create(input: {
    body: Record<string, unknown>;
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
    if (parentId) {
      const parentTask = await prisma.qms_task_dispatches.findUnique({
        where: { id: parentId },
        select: { level: true },
      });
      if (!parentTask) throw new Error('PARENT_NOT_FOUND');
      if (parentTask.level !== 1) throw new Error('PARENT_LEVEL_INVALID');
    }
    return prisma.$transaction(async (tx) => {
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
      if (parentId) {
        await tx.qms_task_dispatches.updateMany({
          where: { id: parentId, status: TASK_DISPATCH_STATUS.PENDING },
          data: { status: TASK_DISPATCH_STATUS.DISPATCHED },
        });
      }
      return created;
    });
  },
  async list(input: {
    all?: string;
    level?: number;
    parentId?: string;
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
    const tasks = await prisma.qms_task_dispatches.findMany({
      where: {
        ...assigneeFilter,
        ...(input.level ? { level: input.level } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...getTaskDispatchArchiveFilter(),
      },
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
  async updateStatus(id: string, status: string) {
    return prisma.qms_task_dispatches.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });
  },
};
