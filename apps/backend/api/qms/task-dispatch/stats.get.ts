import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const currentUserId = String(userinfo.id ?? userinfo.userId);

  // 定义归档项目过滤条件
  const archiveFilter: any = {
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
  };

  try {
    // Count Pending Level 1 Tasks (Assigned to user as head/leader)
    const pendingLevel1 = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        level: 1,
        status: 'PENDING',
        ...archiveFilter,
      },
    });

    // Count Pending Level 2 Tasks (Assigned to user as executor)
    const pendingLevel2 = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        level: 2,
        status: 'PENDING',
        ...archiveFilter,
      },
    });

    // Processing
    const processing = await prisma.qms_task_dispatches.count({
      where: {
        assigneeId: currentUserId,
        status: 'PROCESSING',
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
    logApiError('stats', error);
    return useResponseSuccess({
      pendingLevel1: 0,
      pendingLevel2: 0,
      processing: 0,
      overdue: 0,
    });
  }
});
