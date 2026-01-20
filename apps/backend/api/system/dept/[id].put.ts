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
    return useResponseError('缺少部门ID');
  }

  try {
    const body = await readBody(event); // Wait, use readBody, NOT getRouterParam for body.

    const updateData: Record<string, unknown> = {
      businessUnit: body.businessUnit,
      description: body.remark || body.description,
      name: body.name,
      updatedAt: new Date(),
    };

    if (body.status !== undefined) updateData.status = body.status;
    if (body.parentId || body.pid)
      updateData.parentId = body.parentId || body.pid;
    if (body.orderNo || body.sort)
      updateData.sort = Number(body.orderNo || body.sort);

    await prisma.departments.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update department:', error);
    return useResponseError('更新部门失败');
  }
});
