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
      description: body.name || body.remark || body.description, // Use 'name' from FE as description
      updatedAt: new Date(),
    };

    // Only update name (identifier) if provided and we really want to allow it
    // But usually identifier shouldn't change.
    // In our DB mapping, name = role value.
    if (body.value) {
      updateData.name = body.value;
    }

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
