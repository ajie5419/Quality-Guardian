import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { nanoid } from 'nanoid';
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

    // 1. Determine Category (Fallback to default if not provided)
    let targetCategoryId = body.categoryId;
    if (!targetCategoryId || targetCategoryId === '') {
      const defaultCat = await prisma.knowledge_categories.findFirst({
        where: { id: 'CAT-DEFAULT' },
      });
      if (!defaultCat) {
        // Create it if it doesn't exist
        await prisma.knowledge_categories.create({
          data: { id: 'CAT-DEFAULT', name: '通用知识', sort: 0 },
        });
      }
      targetCategoryId = 'CAT-DEFAULT';
    }

    // 2. Create Knowledge Item
    const newItem = await prisma.knowledge_base.create({
      data: {
        docId: `KB-${nanoid(6).toUpperCase()}`,
        title: body.title || '未命名案例',
        categoryId: targetCategoryId,
        author:
          body.author || userinfo.realName || userinfo.username || 'System',
        summary: body.summary || '',
        content: body.content || '',
        publishDate: new Date(),
        tags: Array.isArray(body.tags) ? body.tags.join(',') : body.tags || '',
        attachment:
          typeof body.attachments === 'string'
            ? body.attachments
            : JSON.stringify(body.attachments || []),
        status: body.status || 'Published',
        version: body.version || 'V1.0',
      },
    });

    return useResponseSuccess(newItem);
  } catch (error) {
    logApiError('knowledge', error);
    setResponseStatus(event, isPrismaUniqueConstraintError(error) ? 409 : 500);
    return useResponseError(
      `沉淀失败: ${error instanceof Error ? error.message : '未知错误'}`,
    );
  }
});
