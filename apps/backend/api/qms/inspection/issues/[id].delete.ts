import { createError, defineEventHandler, getRouterParam } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing ID',
    });
  }

  // Data Ownership Check
  try {
    const existingRecord = await prisma.quality_records.findUnique({
      where: { id },
      select: { inspector: true },
    });

    if (!existingRecord) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Record not found',
      });
    }

    const userRoles = userinfo.roles || [];
    const isAdmin =
      userRoles.includes('super') ||
      userRoles.includes('admin') ||
      userRoles.includes('Super Admin');
    const isOwner = existingRecord.inspector === userinfo.username;

    if (!isAdmin && !isOwner) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Forbidden: You can only delete your own data',
      });
    }
  } catch (error: any) {
    if (error.statusCode) throw error;
    logApiError('issues', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }

  try {
    await InspectionService.deleteRecord(id, String(userinfo.id));
    return useResponseSuccess(null);
  } catch (error) {
    logApiError('issues', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
    });
  }
});
