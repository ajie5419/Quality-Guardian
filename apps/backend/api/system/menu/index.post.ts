import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
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
        pid,
        name: body.name,
        path: body.path || '',
        component: body.component || '',
        icon: body.icon || body.meta?.icon,
        type: body.type || 'menu',
        sort: Number(body.orderNo || body.meta?.orderNo || 0),
        status: body.status ?? 1,
        meta: {
          title: body.title || body.meta?.title,
          icon: body.icon || body.meta?.icon,
          orderNo: Number(body.orderNo || body.meta?.orderNo || 0),
          ...body.meta,
        },
        isDeleted: false,
      },
    });

    return useResponseSuccess(newMenu);
  } catch (error) {
    logApiError('menu', error);
    return useResponseError('创建菜单失败');
  }
});
