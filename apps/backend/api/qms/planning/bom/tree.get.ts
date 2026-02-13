import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { groupBomItemsByWorkOrder, mapBomTreeProjectNode } from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const projects = await prisma.bom_projects.findMany({
      where: { isDeleted: false },
      include: {
        work_order: {
          select: {
            projectName: true,
            customerName: true,
            division: true,
            quantity: true,
            deliveryDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 获取所有BOM项目
    const allBomItems = await prisma.project_boms.findMany({
      orderBy: { created_at: 'asc' },
    });

    const bomItemsByProject = groupBomItemsByWorkOrder(allBomItems);

    const treeNodes = projects.map((project) => {
      const items = bomItemsByProject[project.workOrderNumber] || [];
      return mapBomTreeProjectNode(project, items);
    });

    return useResponseSuccess(treeNodes);
  } catch (error) {
    logApiError('bom-tree', error);
    return internalServerErrorResponse(event, '获取 BOM 树失败');
  }
});
