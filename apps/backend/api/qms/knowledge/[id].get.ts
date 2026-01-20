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
    const item = await prisma.knowledge_base.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!item) return useResponseError('知识条目不存在');

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
    console.error('Failed to fetch knowledge detail:', error);
    return useResponseError('读取详情失败');
  }
});
