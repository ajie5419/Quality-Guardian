import { defineEventHandler, getQuery } from 'h3';
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

    // Get total count
    const total = await prisma.roles.count({
      where: { isDeleted: false },
    });

    const roles = await prisma.roles.findMany({
      where: { isDeleted: false },
      skip: (currentPage - 1) * currentPageSize,
      take: currentPageSize,
      orderBy: { createdAt: 'desc' },
    });

    // Parse permissions (stored as string in DB)
    const processedRoles = roles.map((role) => {
      let permissions = [];
      try {
        if (role.permissions && typeof role.permissions === 'string') {
          permissions = JSON.parse(role.permissions);
        }
      } catch (error) {
        console.warn(`Failed to parse permissions for role ${role.id}:`, error);
      }
      return {
        ...role,
        permissions,
        createTime: role.createdAt
          ? new Date(role.createdAt).toLocaleString('zh-CN')
          : '',
        remark: role.description || '',
        value: role.name, // Frontend expects 'value' for role identifier
      };
    });

    return usePageResponseSuccess(
      page as string,
      pageSize as string,
      processedRoles,
      total,
    );
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    return useResponseSuccess([]); // Fail safe
  }
});
