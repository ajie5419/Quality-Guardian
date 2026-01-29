import { defineEventHandler, getQuery } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const projectId = query.projectId as string;

  if (!projectId) return { code: 0, data: [], message: 'projectId required' };

  try {
    // Correctly fetch from the relation table instead of the legacy JSON column
    const items = await prisma.itp_items.findMany({
      where: {
        projectId: projectId,
        isDeleted: false,
      },
      orderBy: {
        order: 'asc',
      },
    });

    return {
      code: 0,
      data: items,
      message: 'ok',
    };
  } catch (error) {
    console.error('Fetch ITP items error:', error);
    return { code: 0, data: [], message: 'error' };
  }
});
