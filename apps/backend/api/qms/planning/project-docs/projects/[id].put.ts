import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { normalizePlanningProjectName } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  normalizeProjectDocuments,
  stringifyProjectDocuments,
} from '~/utils/project-documents';
import {
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID is required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const documents =
      body.documents === undefined
        ? undefined
        : stringifyProjectDocuments(normalizeProjectDocuments(body.documents));
    const updated = await prisma.doc_projects.update({
      where: { id },
      data: {
        status:
          body.status === undefined ? undefined : String(body.status).trim(),
        projectName: normalizePlanningProjectName(body.projectName),
        documents,
        updatedAt: new Date(),
      },
    });
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('project-docs-projects', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Project not found');
    }
    return internalServerErrorResponse(event, '更新失败');
  }
});
