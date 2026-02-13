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
    return useResponseError('缺少项目ID');
  }

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
    logApiError('knowledge', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025' ? '知识条目不存在' : '更新失败',
    );
  }
});
