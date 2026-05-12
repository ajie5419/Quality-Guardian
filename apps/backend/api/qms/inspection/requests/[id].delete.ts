import { defineEventHandler } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const existing = await prisma.qms_inspection_requests.findFirst({
      select: {
        dispatchTaskId: true,
        id: true,
        requestNo: true,
      },
      where: { id, isDeleted: false },
    });

    if (!existing) {
      return notFoundResponse(event, '报检任务不存在');
    }

    await prisma.$transaction(async (tx) => {
      await tx.qms_inspection_requests.update({
        data: {
          isDeleted: true,
          updatedAt: new Date(),
        },
        where: { id },
      });

      if (existing.dispatchTaskId) {
        await tx.qms_task_dispatches.updateMany({
          data: { status: 'CANCELLED' },
          where: { id: existing.dispatchTaskId },
        });
      }
    });

    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'inspection_request',
    });

    await recordBusinessAuditLog(event, {
      action: 'DELETE',
      details: `删除报检任务: ${existing.requestNo}`,
      targetId: id,
      targetType: 'inspection_request',
      userId: userinfo.id,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('inspection-request-delete', error, { id });
    return internalServerErrorResponse(event, '删除报检任务失败');
  }
});
