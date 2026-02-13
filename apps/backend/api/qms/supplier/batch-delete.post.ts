import { defineEventHandler, readBody, setResponseStatus } from 'h3';
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
      setResponseStatus(event, 400);
      return useResponseError('请提供有效的 ID 列表');
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

    return useResponseSuccess({ count: result.count });
  } catch (error) {
    logApiError('batch-delete', error);
    setResponseStatus(event, 500);
    return useResponseError('批量删除失败');
  }
});
