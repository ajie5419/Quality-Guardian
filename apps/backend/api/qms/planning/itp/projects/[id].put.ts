import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { buildItpProjectUpdateData } from '~/utils/itp';
import { isPrismaNotFoundError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'ITP 项目不存在');
    }
    return internalServerErrorResponse(event, '更新 ITP 项目失败');
  }
});
