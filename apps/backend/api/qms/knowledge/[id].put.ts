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
  if (!id) return useResponseError('缺少项目ID');

  try {
    const body = await readBody(event);

    await prisma.knowledge_base.update({
      where: { id },
      data: {
        title: body.title,
        categoryId: body.categoryId,
        summary: body.summary,
        content: body.content,
        tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags,
        attachment: body.attachments
          ? JSON.stringify(body.attachments)
          : undefined,
        status: body.status,
        version: body.version,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update knowledge item:', error);
    return useResponseError('更新失败');
  }
});
