import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('缺少分类ID');
  }

  try {
    const body = await readBody(event);
    await prisma.knowledge_categories.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        parentId: body.parentId,
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('categories', error);
    const errorCode = (error as { code?: string }).code;
    if (errorCode === 'P2002') {
      setResponseStatus(event, 409);
      return useResponseError('分类名称已存在');
    }
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025' ? '分类不存在' : '更新分类失败',
    );
  }
});
