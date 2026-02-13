import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildKnowledgeCategoryCreateData } from '~/utils/knowledge-category';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
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
    const body = await readBody(event);
    const newCategory = await prisma.knowledge_categories.create({
      data: buildKnowledgeCategoryCreateData(body as Record<string, unknown>),
    });

    return useResponseSuccess(newCategory);
  } catch (error) {
    logApiError('categories', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '分类名称已存在');
    }
    return internalServerErrorResponse(event, '创建分类失败');
  }
});
