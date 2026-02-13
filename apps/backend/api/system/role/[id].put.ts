import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import { redis } from '~/utils/redis';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', '缺少角色ID');
  if (typeof id !== 'string') {
    return id;
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

    await redis.delByPattern('qms:menu:*');
    await prisma.roles.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('role', error);
    if (isPrismaUniqueConstraintError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('角色值已存在');
    }
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? '角色不存在' : '更新角色失败',
    );
  }
});
