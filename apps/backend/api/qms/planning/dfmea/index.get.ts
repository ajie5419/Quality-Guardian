import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const projectId = query.projectId as string;

  try {
    if (projectId) {
      const items = await prisma.dfmea.findMany({
        where: {
          projectId,
          isDeleted: false,
        },
        orderBy: { order: 'asc' },
      });
      return {
        code: 0,
        data: items,
        message: 'ok',
      };
    }

    const allItems = await prisma.dfmea.findMany({
      where: { isDeleted: false },
    });
    return {
      code: 0,
      data: allItems,
      message: 'ok',
    };
  } catch (error) {
    logApiError('dfmea', error);
    return { code: 0, data: [], message: 'error' };
  }
});
