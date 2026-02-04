import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

interface MenuItem {
  id: string;
  parentId?: null | string;
  [key: string]: unknown;
}

interface MenuNode extends MenuItem {
  children: MenuNode[];
}

// Helper to build tree
function buildMenuTree(items: MenuItem[]) {
  const result: MenuNode[] = [];
  const map: Record<string, MenuNode> = {};

  // First pass: create mapping
  items.forEach((item) => {
    map[item.id] = { ...item, children: [] };
  });

  // Second pass: attach to parents
  items.forEach((item) => {
    const node = map[item.id];
    if (item.parentId && item.parentId !== '0' && map[item.parentId]) {
      map[item.parentId].children.push(node);
    } else {
      result.push(node);
    }
  });

  return result;
}

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const menus = await prisma.menus.findMany({
      where: { isDeleted: false },
      orderBy: { order: 'asc' },
    });

    const menuTree = buildMenuTree(menus);
    return useResponseSuccess(menuTree);
  } catch (error) {
    logApiError('list', error);
    return useResponseSuccess([]);
  }
});
