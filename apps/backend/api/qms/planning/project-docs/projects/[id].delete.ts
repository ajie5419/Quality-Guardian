import { defineEventHandler, getRouterParam } from 'h3';
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
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('ID is required');

  try {
    await prisma.doc_projects.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    logApiError('projects', error);
    return useResponseError('Delete failed');
  }
});
