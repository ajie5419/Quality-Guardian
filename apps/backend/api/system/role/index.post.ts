import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
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

  try {
    const body = await readBody(event);

    // Ensure permissions is stringified
    let permissionsStr = '[]';
    if (body.permissions) {
      permissionsStr = JSON.stringify(body.permissions);
    }

    await redis.delByPattern('qms:menu:*');
    const newRole = await prisma.roles.create({
      data: {
        id: `role-${Date.now()}`,
        name: body.value || body.name, // Use 'value' as the unique name identifier
        description: body.remark || body.description || body.name, // Use 'name' as description/display name
        status: body.status ?? 1,
        permissions: permissionsStr,
        isSystem: false,
        isDeleted: false,
      },
    });

    // Return with parsed permissions to be consistent
    return useResponseSuccess({
      ...newRole,
      permissions: body.permissions || [],
    });
  } catch (error) {
    logApiError('role', error);
    // Check for unique constraint violation
    if (isPrismaUniqueConflictError(error)) {
      setResponseStatus(event, 409);
      return useResponseError('角色值已存在');
    }
    setResponseStatus(event, 500);
    return useResponseError('创建角色失败');
  }
});
