import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { all, level, parentId, status } = getQuery(event);

  // 确保 ID 类型为 String 且兼容 id/userId 字段
  const currentUserId = String(
    userinfo.id ?? (userinfo as Record<string, unknown>).userId,
  );
  const isAdmin =
    userinfo.roles?.includes('super') || userinfo.roles?.includes('admin');

  // 解析状态过滤条件，支持逗号分隔的多个状态
  let statusFilter: string | string[] | undefined | { in: string[] };
  if (status) {
    const statusList = String(status).split(',');
    statusFilter = statusList.length > 1 ? { in: statusList } : statusList[0];
  }

  try {
    let assigneeFilter = {};
    if (parentId) {
      assigneeFilter = { parentId: String(parentId) };
    } else if (isAdmin && all === 'true') {
      assigneeFilter = {};
    } else {
      assigneeFilter = { assigneeId: currentUserId };
    }

    const tasks = await prisma.qms_task_dispatches.findMany({
      where: {
        // 如果提供了 parentId，通常是为了查询某个主任务下的所有子任务，此时不限制执行人
        // 否则：如果是管理员且带了 all 参数，查询所有；否则只查指派给自己的
        ...assigneeFilter,
        ...(level ? { level: Number.parseInt(String(level)) } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),

        // 关键：联动过滤已归档项目 (利用 Prisma Relation)
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
      },
      orderBy: { createdAt: 'desc' },
      include: {
        users_qms_task_dispatches_assignorIdTousers: true, // Join assignor
        users_qms_task_dispatches_assigneeIdTousers: true, // Join assignee
        itp_project: true,
        dfmea_project: true,
      },
    });

    const result = tasks.map((t) => ({
      ...t,
      assignorName:
        t.users_qms_task_dispatches_assignorIdTousers?.realName || t.assignorId,
      assigneeName:
        t.users_qms_task_dispatches_assigneeIdTousers?.realName || t.assigneeId,
    }));

    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return useResponseSuccess([]);
  }
});
