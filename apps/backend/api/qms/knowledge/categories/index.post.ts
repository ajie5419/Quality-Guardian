import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
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
    const newCategory = await prisma.knowledge_categories.create({
      data: {
        name: body.name,
        description: body.description,
        parentId: body.parentId || null,
      },
    });

    return useResponseSuccess(newCategory);
  } catch (error) {
    logApiError('categories', error);
    setResponseStatus(event, isPrismaUniqueConstraintError(error) ? 409 : 500);
    return useResponseError(
      isPrismaUniqueConstraintError(error) ? '分类名称已存在' : '创建分类失败',
    );
  }
});
