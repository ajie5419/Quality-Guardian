import { defineEventHandler, getRouterParam, readBody } from 'h3';
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
    if (bodyRecord.orderNo || bodyRecord.meta?.orderNo)
      updateData.sort = Number(bodyRecord.orderNo || bodyRecord.meta?.orderNo);

    // Update meta
    // Since we don't have the current meta easily without fetching, we might overwrite.
    // Ideally we should merge. But for now, we construct from body.
    if (bodyRecord.meta || bodyRecord.title || bodyRecord.icon) {
      updateData.meta = {
        icon: bodyRecord.icon || bodyRecord.meta?.icon,
        orderNo: Number(bodyRecord.orderNo || bodyRecord.meta?.orderNo || 0),
        title: bodyRecord.title || bodyRecord.meta?.title,
        ...bodyRecord.meta,
      };
      // Also update icon column if present
      if (bodyRecord.icon || bodyRecord.meta?.icon) {
        updateData.icon = bodyRecord.icon || bodyRecord.meta?.icon;
      }
    }

    await prisma.menus.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update menu:', error);
    return useResponseError('更新菜单失败');
  }
});
