import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import { redis } from '~/utils/redis';
import {
  conflictResponse,
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
    const body = await readBody(event);

    // Handle PID: frontend might send 0 (number) or '0' or null
    let pid = '0';
    if (body.pid && body.pid !== 0 && body.pid !== '0') {
      pid = String(body.pid);
    }

    const newMenu = await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}`,
        parentId: pid,
        name: body.name,
        path: body.path || '',
        component: body.component || '',
        type: body.type || 'menu',
        order: Number(body.orderNo || body.meta?.orderNo || 0),
        status: body.status ?? 1,
        meta: JSON.stringify({
          title: body.title || body.meta?.title,
          icon: body.icon || body.meta?.icon,
          orderNo: Number(body.orderNo || body.meta?.orderNo || 0),
          ...body.meta,
        }),
        isDeleted: false,
      },
    });

    // Clear menu cache
    await redis.delByPattern('qms:menu:*');

    return useResponseSuccess(newMenu);
  } catch (error) {
    logApiError('menu', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '菜单名称或路径已存在');
    }
    return internalServerErrorResponse(event, '创建菜单失败');
  }
});
