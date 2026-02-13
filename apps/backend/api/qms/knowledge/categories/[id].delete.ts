import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少分类ID');
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
