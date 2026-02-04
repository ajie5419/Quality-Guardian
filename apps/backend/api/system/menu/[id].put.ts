import { defineEventHandler, getRouterParam, readBody } from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    return useResponseError('缺少菜单ID');
  }

  try {
    const body = await readBody(event);
    const bodyRecord = body as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      component: bodyRecord.component,
      name: bodyRecord.name,
      path: bodyRecord.path,
      updatedAt: new Date(),
    };

    if (bodyRecord.status !== undefined) updateData.status = bodyRecord.status;
    if (bodyRecord.orderNo || (bodyRecord.meta as any)?.orderNo)
      updateData.order = Number(
        bodyRecord.orderNo || (bodyRecord.meta as any)?.orderNo,
      );

    // Update meta
    if (bodyRecord.meta || bodyRecord.title || bodyRecord.icon) {
      updateData.meta = JSON.stringify({
        icon: bodyRecord.icon || (bodyRecord.meta as any)?.icon,
        orderNo: Number(
          bodyRecord.orderNo || (bodyRecord.meta as any)?.orderNo || 0,
        ),
        title: bodyRecord.title || (bodyRecord.meta as any)?.title,
        ...(bodyRecord.meta as any),
      });
    }

    await prisma.menus.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('menu', error);
    return useResponseError('更新菜单失败');
  }
});
