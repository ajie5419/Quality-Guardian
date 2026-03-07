import { defineEventHandler, readBody } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaUniqueConstraintError,
} from '~/utils/prisma-error';
import { redis } from '~/utils/redis';
import {
  conflictResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';
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

    await redis.delByPattern('qms:menu:*');
    const role = await prisma.roles.update({
      where: { id },
      data: updateData,
    });

    if (body.permissions !== undefined) {
      const permissions = Array.isArray(body.permissions)
        ? body.permissions
        : [];
      await RbacService.saveRolePermissions(role.id, permissions);
    }

    return useResponseSuccess(null);
  } catch (error) {
    logApiError('role', error);
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, '角色值已存在');
    }
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, '角色不存在');
    }
    return internalServerErrorResponse(event, '更新角色失败');
  }
});
