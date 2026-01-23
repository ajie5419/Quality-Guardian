import { defineEventHandler, getRouterParam } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('id required');

  // 1. Update database via Prisma
  try {
    await prisma.inspections.update({
      where: { id },
      data: { isDeleted: true },
    });
    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    console.error('Delete inspection failed', error);
    if (error.code === 'P2025') {
      return useResponseError('Record not found');
    }
    return useResponseError(`Delete failed: ${error.message}`);
  }
});
