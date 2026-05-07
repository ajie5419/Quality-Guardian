import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import { parseNonEmptyIdList } from '~/utils/id-list';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = (await readBody(event)) as { ids?: unknown };
    const ids = parseNonEmptyIdList(body.ids);

    if (!ids) {
      return badRequestResponse(event, '请提供有效的 ID 列表');
    }

    // 批量软删除
    const result = await prisma.suppliers.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'supplier',
      targetId: ids.join(','),
      details: `批量删除供应商/外协单位: ${result.count} 条`,
    });

    return useResponseSuccess({ count: result.count });
  } catch (error) {
    logApiError('batch-delete', error);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
