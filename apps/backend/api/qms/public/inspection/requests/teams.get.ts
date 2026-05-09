import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';
import { OUTSOURCING_CATEGORY } from '~/utils/supplier';

type DeptRow = {
  id: string;
  name: string;
  parentId: string;
};

function collectLeafDepartments(rows: DeptRow[]) {
  const childrenMap = new Map<string, DeptRow[]>();
  for (const row of rows) {
    childrenMap.set(row.parentId, [
      ...(childrenMap.get(row.parentId) || []),
      row,
    ]);
  }

  const result: DeptRow[] = [];
  const walk = (row: DeptRow) => {
    const children = childrenMap.get(row.id) || [];
    if (children.length === 0) {
      result.push(row);
      return;
    }
    for (const child of children) walk(child);
  };

  const productionRoots = rows.filter(
    (row) => row.name.includes('生产') || row.name.includes('制造'),
  );
  if (productionRoots.length > 0) {
    for (const root of productionRoots) walk(root);
    return result;
  }

  return rows.filter((row) => (childrenMap.get(row.id) || []).length === 0);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const keyword = String(query.keyword || '').trim();

  try {
    const [departments, suppliers] = await Promise.all([
      prisma.departments.findMany({
        where: {
          isDeleted: false,
          status: 1,
        },
        orderBy: { sort: 'asc' },
        select: { id: true, name: true, parentId: true },
      }),
      prisma.suppliers.findMany({
        where: {
          category: OUTSOURCING_CATEGORY,
          isDeleted: false,
          ...(keyword ? { name: { contains: keyword } } : {}),
        },
        orderBy: { name: 'asc' },
        take: 100,
        select: { name: true },
      }),
    ]);

    const internalTeams = collectLeafDepartments(departments)
      .filter((item) => !keyword || item.name.includes(keyword))
      .map((item) => ({
        group: 'internal' as const,
        label: item.name,
        value: item.name,
      }));
    const externalTeams = suppliers.map((item) => ({
      group: 'external' as const,
      label: item.name,
      value: item.name,
    }));

    return useResponseSuccess([...internalTeams, ...externalTeams]);
  } catch (error) {
    logApiError('public-inspection-request-team-list', error);
    return internalServerErrorResponse(event, '获取班组列表失败');
  }
});
