import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const projects = await prisma.dfmea_projects.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    return useResponseSuccess(projects);
  } catch (error) {
    logApiError('dfmea-projects', error);
    return internalServerErrorResponse(event, '获取 DFMEA 项目失败');
  }
});
