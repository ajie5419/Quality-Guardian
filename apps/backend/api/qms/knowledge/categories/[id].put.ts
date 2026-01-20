import { defineEventHandler, getRouterParam, readBody } from 'h3';
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
  if (!id) return useResponseError('缺少分类ID');

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
    console.error('Failed to update category:', error);
    return useResponseError('更新分类失败');
  }
});
