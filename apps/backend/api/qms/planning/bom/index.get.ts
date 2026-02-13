import { defineEventHandler, getQuery } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { mapProjectBomItem, normalizeBomText } from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const projectId = normalizeBomText(query.projectId);

  try {
    if (projectId) {
      // 这里的 projectId 可能是 bom_projects.id，也可能是 workOrderNumber
      // 先尝试作为 bom_projects.id 查找
      const bomProject = await prisma.bom_projects.findUnique({
        where: { id: projectId },
      });

      const workOrderNumber = bomProject
        ? bomProject.workOrderNumber
        : projectId;

      const items = await prisma.project_boms.findMany({
        where: { work_order_number: workOrderNumber },
        orderBy: { created_at: 'desc' },
      });

      return useResponseSuccess(items.map((item) => mapProjectBomItem(item)));
    }

    const allItems = await prisma.project_boms.findMany();
    return useResponseSuccess(allItems.map((item) => mapProjectBomItem(item)));
  } catch (error) {
    logApiError('bom-list', error);
    return internalServerErrorResponse(event, '获取 BOM 条目失败');
  }
});
