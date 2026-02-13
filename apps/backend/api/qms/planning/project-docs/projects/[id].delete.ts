import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { isPrismaNotFoundError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    await prisma.doc_projects.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    logApiError('project-docs-projects', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? 'Project not found' : 'Delete failed',
    );
  }
});
