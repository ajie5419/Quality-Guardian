import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const projects = await prisma.dfmea_projects.findMany({
      where: { isDeleted: false },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const treeNodes = projects.map((project) => {
      const itemCount = project.items.length;
      const avgRpn =
        itemCount > 0
          ? Math.round(
              (project.items.reduce((sum, item) => sum + item.rpn, 0) /
                itemCount) *
                100,
            ) / 100
          : 0;
      const maxRpn =
        itemCount > 0 ? Math.max(...project.items.map((item) => item.rpn)) : 0;

      let riskLevel: 'high' | 'low' | 'medium' = 'low';
      if (maxRpn > 100) riskLevel = 'high';
      else if (maxRpn > 50) riskLevel = 'medium';

      return {
        id: project.id,
        type: 'project',
        name: project.projectName,
        projectName: project.projectName,
        version: project.version,
        status: project.status,
        workOrderNumber: project.workOrderId, // 关键：映射工单号字段供侧边栏显示
        itemCount,
        avgRpn,
        maxRpn,
        riskLevel,
        children: project.items.map((item) => ({
          id: item.id,
          type: 'item',
          parentId: project.id,
          name: item.item,
          projectName: project.projectName,
          failureMode: item.failureMode,
          effects: item.effect,
          severity: item.severity,
          occurrence: item.occurrence,
          detection: item.detection,
          rpn: item.rpn,
          order: item.order,
        })),
      };
    });

    return {
      code: 0,
      data: treeNodes,
      message: 'ok',
    };
  } catch (error) {
    logApiError('tree', error);
    return { code: 0, data: [], message: 'error' };
  }
});
