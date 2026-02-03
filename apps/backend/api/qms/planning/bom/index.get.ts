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

      return {
        code: 0,
        data: items.map((item) => ({
          id: item.id,
          partName: item.part_name,
          partNumber: item.part_number,
          quantity: item.quantity,
          unit: item.unit,
          material: item.material,
          remarks: item.remarks,
          parentId: item.work_order_number,
        })),
        message: 'ok',
      };
    }

    const allItems = await prisma.project_boms.findMany();
    return {
      code: 0,
      data: allItems,
      message: 'ok',
    };
  } catch (error) {
    logApiError('bom-list', error);
    return { code: 0, data: [], message: 'error' };
  }
});
