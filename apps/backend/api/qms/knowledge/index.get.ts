import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { categoryId, keyword, page = 1, pageSize = 10 } = getQuery(event);
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Number(pageSize);

  try {
    const where = {
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
    };

    const [list, total] = await Promise.all([
      prisma.knowledge_base.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.knowledge_base.count({ where }),
    ]);

    const items = list.map((item) => ({
      ...item,
      categoryName: item.category?.name || '未分类',
      publishDate: item.publishDate
        ? item.publishDate.toISOString().split('T')[0]
        : item.createdAt.toISOString().split('T')[0],
      tags: item.tags ? item.tags.split(',') : [],
      attachments: item.attachment ? JSON.parse(item.attachment) : [],
      updatedAt: item.updatedAt.toLocaleString(),
    }));

    return useResponseSuccess({ items, total });
  } catch (error) {
    console.error('Failed to fetch knowledge items:', error);
    return useResponseSuccess({ items: [], total: 0 });
  }
});
