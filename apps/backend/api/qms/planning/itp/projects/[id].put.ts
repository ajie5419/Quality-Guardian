import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { buildItpProjectUpdateData } from '~/utils/itp';
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
    const updateData = buildItpProjectUpdateData(
      body as Record<string, unknown>,
    );

    const updated = await prisma.quality_plans.update({
      where: { id },
      data: updateData,
    });

    return useResponseSuccess(updated);
  } catch (error: unknown) {
    logApiError('itp-projects', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2025' ? 404 : 500);
    return useResponseError(
      errorCode === 'P2025' ? 'ITP 项目不存在' : '更新 ITP 项目失败',
    );
  }
});
