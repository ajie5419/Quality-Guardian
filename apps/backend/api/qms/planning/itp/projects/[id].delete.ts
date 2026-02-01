import { defineEventHandler, getRouterParam } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');

  try {
    await prisma.quality_plans.update({
      where: { id },
      data: { isDeleted: true },
    });

    return {
      code: 0,
      data: null,
      message: 'ok',
    };
  } catch (error) {
    logApiError('projects', error);
    return { code: -1, message: 'Delete failed' };
  }
});
