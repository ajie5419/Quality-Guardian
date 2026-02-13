import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import {
  getTaskDispatchArchiveFilter,
  resolveTaskDispatchAssigneeFilter,
  resolveTaskDispatchCurrentUserId,
  resolveTaskDispatchStatusFilter,
} from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { all, level, parentId, status } = getQuery(event);

  // 确保 ID 类型为 String 且兼容 id/userId 字段
  const currentUserId = await resolveTaskDispatchCurrentUserId(
    userinfo,
    prisma,
  );
  if (!currentUserId) {
    return badRequestResponse(event, '无法识别当前用户');
  }
  const isAdmin =
    userinfo.roles?.includes('super') || userinfo.roles?.includes('admin');
  const statusFilter = resolveTaskDispatchStatusFilter(status);
  const assigneeFilter = resolveTaskDispatchAssigneeFilter({
    all,
    currentUserId,
    isAdmin,
    parentId,
  });
  const archiveFilter = getTaskDispatchArchiveFilter();

  try {
    const tasks = await prisma.qms_task_dispatches.findMany({
      where: {
        ...assigneeFilter,
        ...(level ? { level: Number.parseInt(String(level)) } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...archiveFilter,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        users_qms_task_dispatches_assignorIdTousers: true, // Join assignor
        users_qms_task_dispatches_assigneeIdTousers: true, // Join assignee
        itp_project: true,
        dfmea_project: true,
      },
    });

    const result = tasks.map((t: any) => ({
      ...t,
      assignorName:
        t.users_qms_task_dispatches_assignorIdTousers?.realName || t.assignorId,
      assigneeName:
        t.users_qms_task_dispatches_assigneeIdTousers?.realName || t.assigneeId,
    }));

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('task-dispatch', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch task dispatch list');
  }
});
