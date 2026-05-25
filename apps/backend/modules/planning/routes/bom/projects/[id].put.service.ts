import type { H3Event } from 'h3';

import { logApiError } from '~/utils/api-logger';
import { normalizeBomProjectStatus } from '~/utils/bom';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function bom_projects_id_put(event: H3Event) {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updateData = buildPlanningProjectUpdateData(
      body,
      normalizeBomProjectStatus,
    );
    const updated = await prisma.bom_projects.update({
      where: { id },
      data: applyGovernedProjectNameByTable('bom_projects', updateData),
    });
    return useResponseSuccess(updated);
  } catch (error) {
    logApiError('bom-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'BOM project not found');
    }
    return internalServerErrorResponse(event, 'Failed to update BOM project');
  }
}
