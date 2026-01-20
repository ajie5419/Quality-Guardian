import { defineEventHandler } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const projects = await prisma.dfmea_projects.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    return {
      code: 0,
      data: projects,
      message: 'ok',
    };
  } catch {
    return { code: 0, data: [], message: 'error' };
  }
});
