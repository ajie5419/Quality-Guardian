import { defineEventHandler, readBody } from 'h3';
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
    const newCategory = await prisma.knowledge_categories.create({
      data: {
        name: body.name,
        description: body.description,
        parentId: body.parentId || null,
      },
    });

    return useResponseSuccess(newCategory);
  } catch (error) {
    console.error('Failed to create category:', error);
    return useResponseError('创建分类失败');
  }
});
