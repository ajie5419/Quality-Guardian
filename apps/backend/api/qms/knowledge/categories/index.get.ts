import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
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
    let categories = await prisma.knowledge_categories.findMany({
      where: { isDeleted: false },
      orderBy: { sort: 'asc' },
    });

    // 如果数据库中完全没有分类，则自动创建一个默认分类
    if (categories.length === 0) {
      const defaultCat = await prisma.knowledge_categories.create({
        data: {
          id: 'CAT-DEFAULT',
          name: '通用知识',
          description: '系统自动创建的默认知识分类',
          sort: 0,
        },
      });
      categories = [defaultCat];
    }

    interface CategoryNode {
      children: CategoryNode[];
      id: string;
      name: string;
      parentId?: null | string;
      [key: string]: unknown;
    }

    // 将扁平数组转换为树形结构
    const buildTree = (parentId: null | string = null): CategoryNode[] => {
      return categories
        .filter((cat) => cat.parentId === parentId)
        .map((cat) => ({
          ...cat,
          children: buildTree(cat.id),
        }));
    };

    const tree = buildTree(null);
    return useResponseSuccess(tree);
  } catch (error) {
    logApiError('categories', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch knowledge categories',
    );
  }
});
