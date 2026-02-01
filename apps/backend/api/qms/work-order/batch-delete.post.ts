import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return useResponseError('请提供有效的 ID 列表');
    }

    // work_orders 表的主键是 workOrderNumber
    const result = await prisma.work_orders.updateMany({
      where: {
        workOrderNumber: { in: ids },
        isDeleted: false, // 只删除未删除的记录
      },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess({ successCount: result.count });
  } catch (error) {
    logApiError('batch-delete', error);
    return useResponseError('批量删除失败');
  }
});
