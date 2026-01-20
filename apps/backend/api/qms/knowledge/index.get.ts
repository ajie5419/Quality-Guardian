import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { categoryId, keyword } = getQuery(event);

  try {
    const list = await prisma.knowledge_base.findMany({
      where: {
        isDeleted: false,
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
        ...(keyword
          ? {
              OR: [
                { title: { contains: String(keyword) } },
                { summary: { contains: String(keyword) } },
              ],
            }
          : {}),
      },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = list.map((item) => ({
      ...item,
      categoryName: item.category?.name || '未分类',
      publishDate: item.publishDate
        ? item.publishDate.toISOString().split('T')[0]
        : item.createdAt.toISOString().split('T')[0],
      tags: item.tags ? item.tags.split(',') : [],
      attachments: item.attachment ? JSON.parse(item.attachment) : [],
      updatedAt: item.updatedAt.toLocaleString(),
    }));

    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch knowledge items:', error);
    return useResponseSuccess([]);
  }
});
