import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  usePageResponseSuccess,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const { page = 1, pageSize = 20 } = getQuery(event);
    const currentPage = Number(page);
    const currentPageSize = Number(pageSize);

    const total = await prisma.users.count({
      where: { isDeleted: false },
    });

    const users = await prisma.users.findMany({
      where: { isDeleted: false },
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        roles: true,
      },
    });

    // Get all departments for deptName lookup
    const departments = await prisma.departments.findMany({
      where: { isDeleted: false },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    // Map to frontend structure
    const result = users.map((user) => ({
      ...user,
      userId: user.id,
      deptId: user.department,
      deptName: deptMap.get(user.department) || '',
      roleIds: [user.roleId],
      roles: user.roles?.name ? [user.roles.name] : [],
      status: user.status === 'ACTIVE' ? 1 : 0,
      createTime: user.createdAt
        ? new Date(user.createdAt).toLocaleString('zh-CN')
        : '',
      remark: '', // users table doesn't have remark field yet
    }));

    return usePageResponseSuccess(page as string, pageSize as string, result, {
      total,
    });
  } catch (error) {
    logApiError('list', error);
    return useResponseSuccess([]);
  }
});
