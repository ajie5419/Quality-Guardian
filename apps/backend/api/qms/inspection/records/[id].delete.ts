import { defineEventHandler, getRouterParam } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { DETAILED_INSPECTIONS_LIST } from '~/utils/qms-data';
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

  // 1. Check if it's in Detailed Mock List
  const mockIndex = DETAILED_INSPECTIONS_LIST.findIndex((i) => i.id === id);
  if (mockIndex !== -1) {
    DETAILED_INSPECTIONS_LIST.splice(mockIndex, 1);
    return useResponseSuccess({ message: 'Deleted from mock' });
  }

  // 2. Otherwise, update database via Prisma
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
