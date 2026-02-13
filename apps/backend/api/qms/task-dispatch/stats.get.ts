import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import {
  getTaskDispatchArchiveFilter,
  resolveTaskDispatchCurrentUserId,
  TASK_DISPATCH_STATUS,
} from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const currentUserId = await resolveTaskDispatchCurrentUserId(
    userinfo,
    prisma,
  );
  if (!currentUserId) {
    return badRequestResponse(event, '无法识别当前用户');
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
    return internalServerErrorResponse(
      event,
      'Failed to fetch task dispatch stats',
    );
  }
});
