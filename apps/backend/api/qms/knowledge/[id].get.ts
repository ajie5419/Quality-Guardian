import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
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

  const id = getRequiredRouterParam(event, 'id', '缺少项目ID');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const item = await prisma.knowledge_base.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!item) {
      return notFoundResponse(event, '知识条目不存在');
    }

    const result = {
      ...item,
      categoryName: item.category?.name || '未分类',
      publishDate: item.publishDate
        ? item.publishDate.toISOString().split('T')[0]
        : item.createdAt.toISOString().split('T')[0],
      tags: item.tags ? item.tags.split(',') : [],
      attachments: item.attachment ? JSON.parse(item.attachment) : [],
      updatedAt: item.updatedAt.toLocaleString(),
    };

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('knowledge', error);
    return internalServerErrorResponse(event, '读取详情失败');
  }
});
