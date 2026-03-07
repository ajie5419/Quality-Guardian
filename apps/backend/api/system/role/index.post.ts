import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConflictError } from '~/utils/prisma-error';
import { redis } from '~/utils/redis';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { requireSystemAdmin } from '~/utils/system-auth';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const adminCheck = requireSystemAdmin(event, userinfo);
  if (adminCheck) {
    return adminCheck;
  }

  try {
    const body = await readBody(event);

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];

    await redis.delByPattern('qms:menu:*');
    const newRole = await prisma.roles.create({
      data: {
        id: `role-${Date.now()}`,
        name: body.value || body.name, // Use 'value' as the unique name identifier
        description: body.remark || body.description || body.name, // Use 'name' as description/display name
        status: body.status ?? 1,
        permissions: JSON.stringify(permissions),
        isSystem: false,
        isDeleted: false,
      },
    });

    await RbacService.saveRolePermissions(newRole.id, permissions);

    // Return with parsed permissions to be consistent
    return useResponseSuccess({
      ...newRole,
      permissions,
    });
  } catch (error) {
    logApiError('role', error);
    // Check for unique constraint violation
    if (isPrismaUniqueConflictError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    return internalServerErrorResponse(event, '创建角色失败');
  }
});
