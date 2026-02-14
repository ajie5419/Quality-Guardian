import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { buildDfmeaProjectUpdateData } from '~/utils/dfmea';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updateData = buildDfmeaProjectUpdateData(
      body as Record<string, unknown>,
    );

    const updatedProject = await prisma.dfmea_projects.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(updatedProject);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('dfmea-projects', error);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 项目不存在');
    }
    return internalServerErrorResponse(event, `更新失败: ${errorMessage}`);
  }
});
