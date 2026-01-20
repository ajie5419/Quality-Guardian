import { defineEventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const workOrders = await prisma.work_orders.findMany({
        where: { isDeleted: false },
        include: { project_boms: true },
        orderBy: { createdAt: 'desc' },
    });

    const treeData = workOrders.map((wo) => {
      // 将数据库状态映射为前端 Tab 可识别的状态
      // COMPLETED/CLOSED 映射为 archived，其余为 active
      const isArchived = ['COMPLETED', 'CLOSED'].includes(wo.status);
      const status = isArchived ? 'archived' : 'active';

      return {
        id: wo.workOrderNumber,
        type: 'project',
        name: wo.projectName || wo.workOrderNumber,
        workOrderNumber: wo.workOrderNumber,
        itemCount: wo.project_boms.length,
        status, // 关键：必须返回正确的 status 以供前端过滤
        children: wo.project_boms.map((bom) => ({
          id: bom.id,
          type: 'item',
          name: bom.part_name,
          partNumber: bom.part_number,
          quantity: bom.quantity,
          unit: bom.unit,
          material: bom.material,
          remarks: bom.remarks,
          parentId: wo.workOrderNumber,
        })),
      };
    });

    return useResponseSuccess(treeData);
  } catch (error) {
    console.error('Fetch BOM tree error', error);
    return useResponseSuccess([]);
  }
});
