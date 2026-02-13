import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
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
    if (isPrismaUniqueConstraintError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('分类名称已存在');
    }
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '分类不存在' : '更新分类失败',
    );
  }
});
