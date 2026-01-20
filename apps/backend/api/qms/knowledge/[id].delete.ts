import { defineEventHandler, getRouterParam } from 'h3';
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
  if (!id) return useResponseError('缺少项目ID');

  try {
    await prisma.knowledge_base.update({
      where: { id },
      data: { isDeleted: true },
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to delete knowledge item:', error);
    return useResponseError('删除失败');
  }
});
