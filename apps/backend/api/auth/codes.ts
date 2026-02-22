import { eventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { ensureVehicleCommissioningMenu } from '~/utils/menu-bootstrap';
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
    await ensureVehicleCommissioningMenu();

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

    // 超级管理员：返回“已勾选 + 全量系统权限码”并集
    // 避免新增菜单后，历史勾选列表导致新功能不可见。
    if (role.name === 'super' || role.name === 'Super Admin') {
      const allMenus = await prisma.menus.findMany({
        where: {
          authCode: { not: null },
          isDeleted: false,
          status: 1,
        },
        select: { authCode: true },
      });
      const mergedCodes = [
        ...new Set([
          ...allMenus.map((menu) => menu.authCode as string),
          ...codes,
        ]),
      ];
      return useResponseSuccess(mergedCodes);
    }

    return useResponseSuccess(codes);
  } catch (error) {
    logApiError('codes', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission codes');
  }
});
