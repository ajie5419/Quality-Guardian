import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import {
  getTaskDispatchArchiveFilter,
  resolveTaskDispatchUserId,
  TASK_DISPATCH_STATUS,
} from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const currentUserId = resolveTaskDispatchUserId(userinfo);
  if (!currentUserId) {
    setResponseStatus(event, 400);
    return useResponseError('无法识别当前用户');
  }

  const archiveFilter = getTaskDispatchArchiveFilter();

  try {
    // Count Pending Level 1 Tasks (Assigned to user as head/leader)
    const pendingLevel1 = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        level: 1,
        status: TASK_DISPATCH_STATUS.PENDING,
        ...archiveFilter,
      },
    });

    // Count Pending Level 2 Tasks (Assigned to user as executor)
    const pendingLevel2 = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        level: 2,
        status: TASK_DISPATCH_STATUS.PENDING,
        ...archiveFilter,
      },
    });

    // Processing
    const processing = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        status: TASK_DISPATCH_STATUS.PROCESSING,
        ...archiveFilter,
      },
    });

    return useResponseSuccess({
      pendingLevel1,
      pendingLevel2,
      processing,
      overdue: 0,
    });
  } catch (error) {
    logApiError('task-dispatch-stats', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch task dispatch stats');
  }
});
