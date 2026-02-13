import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildKnowledgeCategoryUpdateData } from '~/utils/knowledge-category';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import {
  conflictResponse,
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

  const id = getRequiredRouterParam(event, 'id', '缺少分类ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    await prisma.knowledge_categories.update({
      where: { id },
      data: buildKnowledgeCategoryUpdateData(body as Record<string, unknown>),
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('categories', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '分类名称已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '分类不存在');
    }
    return internalServerErrorResponse(event, '更新分类失败');
  }
});
