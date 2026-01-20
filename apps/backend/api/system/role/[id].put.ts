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
    return useResponseError('缺少角色ID');
  }

  try {
    const body = await readBody(event);

    const updateData: Record<string, unknown> = {
      description: body.remark || body.description,
      name: body.name,
      updatedAt: new Date(),
      value: body.value,
    };

    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.permissions !== undefined) {
      updateData.permissions = JSON.stringify(body.permissions);
    }

    await prisma.roles.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update role:', error);
    return useResponseError('更新角色失败');
  }
});
