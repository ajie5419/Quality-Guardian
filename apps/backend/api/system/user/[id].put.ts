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
    return useResponseError('缺少用户ID');
  }

  try {
    const body = await readBody(event);

    const updateData: Record<string, unknown> = {
      department: body.deptId,
      email: body.email,
      phone: body.phone,
      realName: body.realName,
      updatedAt: new Date(),
    };

    if (body.username) updateData.username = body.username;
    if (body.roleIds && body.roleIds.length > 0) {
      updateData.roleId = body.roleIds[0];
    }
    if (body.status !== undefined) {
      updateData.status = body.status === 1 ? 'ACTIVE' : 'INACTIVE';
    }

    await prisma.users.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    console.error('Failed to update user:', error);
    return useResponseError('更新用户失败');
  }
});
