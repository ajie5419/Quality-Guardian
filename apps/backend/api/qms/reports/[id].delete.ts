import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.reports.delete({
      where: { id },
    });
    return useResponseSuccess({ message: 'Deleted' });
  } catch (error: unknown) {
    logApiError('reports', error);
    const typedError = error as { code?: string; message?: string };
    if (isPrismaNotFoundError(error)) {
      setResponseStatus(event, 404);
      return useResponseError('Report not found');
    }
    setResponseStatus(event, 500);
    return useResponseError(`Delete failed: ${typedError.message}`);
  }
});
