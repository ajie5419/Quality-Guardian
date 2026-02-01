import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

interface DeptItem {
  id: string;
  name: string;
  parentId?: null | string;
}

interface DeptNode extends DeptItem {
  children: DeptNode[];
}

// Helper to build tree
function buildDeptTree(items: DeptItem[]) {
  const result: DeptNode[] = [];
  const map: Record<string, DeptNode> = {};

  // First pass: create mapping
  items.forEach((item) => {
    map[item.id] = {
      ...item,
      children: [],
    };
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

/**
 * Public endpoint to fetch departments for registration
 */
export default defineEventHandler(async () => {
  try {
    const departments = await prisma.departments.findMany({
      where: {
        isDeleted: false,
        status: 1,
      },
      orderBy: { sort: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    const tree = buildDeptTree(departments);
    return useResponseSuccess(tree);
  } catch (error) {
    logApiError('departments', error);
    return useResponseSuccess([]);
  }
});
