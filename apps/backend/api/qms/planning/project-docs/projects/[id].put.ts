import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  isPrismaNotFoundError,
  normalizePlanningProjectName,
} from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID is required');
  }

  try {
    const body = await readBody(event);
    const updated = await prisma.doc_projects.update({
      where: { id },
      data: {
        status:
          body.status === undefined ? undefined : String(body.status).trim(),
        projectName: normalizePlanningProjectName(body.projectName),
        updatedAt: new Date(),
      },
    });
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('project-docs-projects', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? 'Project not found' : '更新失败',
    );
  }
});
