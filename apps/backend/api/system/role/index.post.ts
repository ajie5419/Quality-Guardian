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

    // Ensure permissions is stringified
    let permissionsStr = '[]';
    if (body.permissions) {
      permissionsStr = JSON.stringify(body.permissions);
    }

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
    if (String(error).includes('Unique constraint')) {
      return useResponseError('角色值已存在');
    }
    return useResponseError('创建角色失败');
  }
});
