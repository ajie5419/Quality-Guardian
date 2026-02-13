import { eventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const userId = userinfo.userId || userinfo.id;
  if (!userId) {
    return useResponseSuccess([]);
  }

  try {
    const user = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(userId) }, { username: userinfo.username }],
      },
    });

    if (!user || !user.roleId) {
      return useResponseSuccess([]);
    }

    const role = await prisma.roles.findFirst({
      where: { id: user.roleId },
    });

    if (!role || !role.permissions) {
      return useResponseSuccess([]);
    }

    // 解析角色中存储的权限列表（即您在 UI 权限树勾选的结果）
    let codes: string[] = [];
    try {
      codes = JSON.parse(role.permissions || '[]');
    } catch {
      codes = [];
    }

    // 🔴 关键修复：让超级管理员也遵循勾选逻辑
    // 如果 codes 数组不为空，说明管理员已经在 UI 上进行了显式分配，我们直接返回勾选的列表
    if (codes.length > 0) {
      return useResponseSuccess(codes);
    }

    // 只有在权限列表完全为空，且是超级管理员时，才执行全量下发（兜底逻辑）
    if (role.name === 'super' || role.name === 'Super Admin') {
      const allMenus = await prisma.menus.findMany({
        where: { authCode: { not: null }, status: 1 },
        select: { authCode: true },
      });
      const allSystemCodes = [
        ...new Set(allMenus.map((m) => m.authCode as string)),
      ];
      return useResponseSuccess(allSystemCodes);
    }

    return useResponseSuccess(codes);
  } catch (error) {
    logApiError('codes', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
