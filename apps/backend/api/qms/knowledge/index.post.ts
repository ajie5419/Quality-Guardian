import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildKnowledgeCreateData } from '~/utils/knowledge';
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
      data: buildKnowledgeCreateData(
        body as Record<string, unknown>,
        String(targetCategoryId),
        {
          realName: userinfo.realName,
          username: userinfo.username,
        },
      ),
    });

    return useResponseSuccess(newItem);
  } catch (error) {
    logApiError('knowledge', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '沉淀失败: 文档编号已存在');
    }
    return internalServerErrorResponse(
      event,
      `沉淀失败: ${error instanceof Error ? error.message : '未知错误'}`,
    );
  }
});
