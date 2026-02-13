import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { buildProjectBomMutableData, mapProjectBomItem } from '~/utils/bom';
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
    const updated = await prisma.project_boms.update({
      where: { id },
      data: buildProjectBomMutableData(body),
    });

    return useResponseSuccess(mapProjectBomItem(updated));
  } catch (error) {
    logApiError('bom', error);
    setResponseStatus(event, isPrismaNotFoundError(error) ? 404 : 500);
    return useResponseError(
      isPrismaNotFoundError(error) ? 'BOM item not found' : '更新 BOM 条目失败',
    );
  }
});
