import { defineEventHandler, readBody } from 'h3';
import { nanoid } from 'nanoid';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);

  try {
    // 检查是否已存在 bom_projects 记录，如果不存在则创建
    let bomProject = await prisma.bom_projects.findUnique({
      where: { workOrderNumber: body.workOrderNumber },
    });

    if (!bomProject) {
      // 获取工单信息
      const workOrder = await prisma.work_orders.findUnique({
        where: { workOrderNumber: body.workOrderNumber },
      });

      bomProject = await prisma.bom_projects.create({
        data: {
          id: `BOM-PROJ-${nanoid(6).toUpperCase()}`,
          workOrderNumber: body.workOrderNumber,
          projectName: body.projectName || workOrder?.projectName || body.workOrderNumber,
          status: 'active',
        },
      });
    }

    // 创建 BOM 物料明细
    const newItem = await prisma.project_boms.create({
      data: {
        id: `BOM-${nanoid(6).toUpperCase()}`,
        work_order_number: body.workOrderNumber,
        part_name: body.partName,
        part_number: body.partNumber,
        material: body.material,
        quantity: Number(body.quantity || 1),
        unit: body.unit || 'PCS',
        remarks: body.remarks,
        updated_at: new Date(),
      },
    });

    return {
      code: 0,
      data: {
        ...newItem,
        projectId: bomProject.id,
      },
      message: 'ok',
    };
  } catch (error) {
    logApiError('bom', error);
    return { code: -1, message: '添加物料失败' };
  }
});
