import { defineEventHandler, getQuery } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const projectId = query.projectId as string;

  if (!projectId) return { code: 0, data: [], message: 'projectId required' };

  try {
    const project = await prisma.quality_plans.findUnique({
      where: { id: projectId },
    });

    if (!project || !project.itpItems) {
      return { code: 0, data: [], message: 'ok' };
    }

    const items = JSON.parse(project.itpItems);
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
