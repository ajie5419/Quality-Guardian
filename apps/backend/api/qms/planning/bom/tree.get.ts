import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    // 🛠️ 关键改进：从 bom_projects 表获取，实现“手动添加”逻辑
    const projects = await prisma.bom_projects.findMany({
      where: { isDeleted: false },
      include: {
        work_order: {
          include: {
            project_boms: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const treeData = projects.map((p) => {
      const wo = p.work_order;
      const isArchived =
        ['CLOSED', 'COMPLETED'].includes(wo.status) || p.status === 'archived';
      const status = isArchived ? 'archived' : 'active';

      return {
        id: p.id,
        projectId: p.id,
        type: 'project',
        name: p.projectName || wo.projectName || wo.workOrderNumber,
        workOrderNumber: wo.workOrderNumber,
        itemCount: wo.project_boms.length,
        status,
        children: wo.project_boms.map((bom) => ({
          id: bom.id,
          type: 'item',
          name: bom.part_name,
          partNumber: bom.part_number,
          quantity: bom.quantity,
          unit: bom.unit,
          material: bom.material,
          remarks: bom.remarks,
          parentId: p.id,
        })),
      };
    });

    return useResponseSuccess(treeData);
  } catch (error) {
    logApiError('tree', error);
    return useResponseSuccess([]);
  }
});
