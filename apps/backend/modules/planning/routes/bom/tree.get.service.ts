import type { H3Event } from 'h3';

import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';

export async function bom_tree_get(event: H3Event) {
  await awaitMockDelay();

  try {
    // governance-allow-direct-canonical-read: BOM tree renders project labels for listing.
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
      select: projectBomItemSelect,
      orderBy: [{ part_number: 'asc' }, { created_at: 'asc' }],
    });

    const bomItemsByProject = groupBomItemsByWorkOrder(allBomItems);

    const treeNodes = projects.map((project) => {
      const items = bomItemsByProject[project.workOrderNumber] || [];
      return mapBomTreeProjectNode(project, items);
    });

    return useResponseSuccess(treeNodes);
  } catch (error) {
    logApiError('bom-tree', error, undefined, event);
    return internalServerErrorResponse(event, '获取 BOM 树失败');
  }
}
