import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { buildDfmeaProjectUpdateData } from '~/utils/dfmea';
import { MOCK_DELAY } from '~/utils/index';
import { isPrismaNotFoundError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('ID required');
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
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(`更新失败: ${errorMessage}`);
  }
});
