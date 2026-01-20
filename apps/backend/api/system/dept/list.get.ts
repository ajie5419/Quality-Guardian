import { defineEventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

interface DeptItem {
  createdAt?: Date | string;
  description?: string;
  id: string;
  name: string;
  parentId?: null | string;
}

interface DeptNode extends DeptItem {
  children: DeptNode[];
  createTime: string;
  remark: string;
}

// Helper to build tree
function buildDeptTree(items: DeptItem[]) {
  const result: DeptNode[] = [];
  const map: Record<string, DeptNode> = {};

  // First pass: create mapping with formatted fields
  items.forEach((item) => {
    map[item.id] = {
      ...item,
      children: [],
      createTime: item.createdAt
        ? new Date(item.createdAt).toLocaleString('zh-CN')
        : '',
      remark: item.description || '',
    };
  });

  // Second pass: attach to parents
  items.forEach((item) => {
    const node = map[item.id];
    // parentId might be '0' or null or empty string for root
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
    const departments = await prisma.departments.findMany({
      where: { isDeleted: false },
      orderBy: { sort: 'asc' }, // Order by sort, then createdAt?
    });

    // Build tree
    const tree = buildDeptTree(departments);

    return useResponseSuccess(tree);
  } catch (error) {
    console.error('Failed to fetch departments:', error);
    return useResponseSuccess([]);
  }
});
