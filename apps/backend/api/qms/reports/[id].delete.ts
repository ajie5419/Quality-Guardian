import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
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
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('id required');
  }

  try {
    await prisma.reports.delete({
      where: { id },
    });
    return useResponseSuccess({ message: 'Deleted' });
  } catch (error: any) {
    logApiError('reports', error);
    if (error.code === 'P2025') {
      setResponseStatus(event, 404);
      return useResponseError('Report not found');
    }
    setResponseStatus(event, 500);
    return useResponseError(`Delete failed: ${error.message}`);
  }
});
