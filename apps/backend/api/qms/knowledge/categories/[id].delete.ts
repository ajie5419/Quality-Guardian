import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少分类ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    // 软删除分类
    await prisma.knowledge_categories.update({
      where: { id },
      data: { isDeleted: true },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('categories', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '分类不存在' : '删除分类失败',
    );
  }
});
