import { defineEventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

interface MenuItem {
  id: string;
  pid?: null | string;
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
    if (item.pid && item.pid !== '0' && map[item.pid]) {
      map[item.pid].children.push(node);
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
      orderBy: { sort: 'asc' },
    });

    const menuTree = buildMenuTree(menus);
    return useResponseSuccess(menuTree);
  } catch (error) {
    console.error('Failed to fetch menus:', error);
    return useResponseSuccess([]);
  }
});
