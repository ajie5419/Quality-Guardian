import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { normalizeBomProjectStatus } from '~/utils/bom';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { buildPlanningProjectUpdateData } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
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

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updated = await prisma.bom_projects.update({
      where: { id },
      data: buildPlanningProjectUpdateData(body, normalizeBomProjectStatus),
    });
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('bom-projects', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'BOM project not found');
    }
    return internalServerErrorResponse(event, 'Failed to update BOM project');
  }
});
