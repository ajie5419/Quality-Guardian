import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少菜单ID');
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as {
      component?: string;
      icon?: string;
      meta?: Record<string, unknown>;
      name?: string;
      orderNo?: number | string;
      path?: string;
      status?: number;
      title?: string;
    };

    const updateData: Record<string, unknown> = {
      component: bodyRecord.component,
      name: bodyRecord.name,
      path: bodyRecord.path,
      updatedAt: new Date(),
    };

    if (bodyRecord.status !== undefined) updateData.status = bodyRecord.status;

    // Resolve order and meta
    const meta = (bodyRecord.meta || {}) as Record<string, unknown>;
    const orderNo = Number(bodyRecord.orderNo || meta.orderNo || 0);

    if (bodyRecord.orderNo !== undefined || meta.orderNo !== undefined) {
      updateData.order = orderNo;
    }

    // Update meta stringified
    if (bodyRecord.meta || bodyRecord.title || bodyRecord.icon) {
      updateData.meta = JSON.stringify({
        ...meta,
        icon: bodyRecord.icon || meta.icon,
        orderNo,
        title: bodyRecord.title || meta.title,
      });
    }

    await redis.delByPattern('qms:menu:*');
    await prisma.menus.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error: unknown) {
    logApiError('menu-update', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(`更新菜单失败: ${errorMessage}`);
  }
});
