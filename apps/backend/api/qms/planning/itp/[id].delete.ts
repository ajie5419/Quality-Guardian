import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { awaitMockDelay } from '~/utils/index';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const userinfo = verifyAccessToken(event);
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // 软删除
    const deleted = await prisma.itp_items.update({
      where: { id },
      data: { isDeleted: true },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo?.id,
      action: 'DELETE',
      targetType: 'planning_itp_item',
      targetId: String(id),
      details: `删除 ITP 条目: ${deleted.processStep || deleted.activity || id}`,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('itp', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 条目不存在');
    }
    return internalServerErrorResponse(event, '删除 ITP 条目失败');
  }
});
