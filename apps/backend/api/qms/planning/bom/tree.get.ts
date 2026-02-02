import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
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

    // 将BOM项目按工单号分组
    const bomItemsByProject = allBomItems.reduce((acc, item) => {
      const workOrderNumber = item.work_order_number;
      if (!acc[workOrderNumber]) {
        acc[workOrderNumber] = [];
      }
      acc[workOrderNumber].push(item);
      return acc;
    }, {} as Record<string, typeof allBomItems>);

    const treeNodes = projects.map((project) => {
      const items = bomItemsByProject[project.workOrderNumber] || [];
      const itemCount = items.length;

      return {
        id: project.id,
        type: 'project',
        name: project.projectName,
        projectName: project.projectName,
        version: '1.0',
        status: project.status,
        workOrderNumber: project.workOrderNumber, // 关键：映射工单号字段供侧边栏显示
        itemCount,
        productName: project.work_order?.projectName || '',
        productModel: project.work_order?.division || '',
        customerName: project.work_order?.customerName || '',
        quantity: project.work_order?.quantity,
        deliveryDate: project.work_order?.deliveryDate,
        children: items.map((item) => ({
          id: item.id,
          type: 'item',
          parentId: project.id,
          name: item.part_name,
          partNumber: item.part_number,
          quantity: item.quantity,
          unit: item.unit,
          material: item.material,
          remarks: item.remarks,
          projectName: project.projectName,
          workOrderNumber: project.workOrderNumber,
        })),
      };
    });

    return {
      code: 0,
      data: treeNodes,
      message: 'ok',
    };
  } catch (error) {
    logApiError('bom-tree', error);
    return { code: 0, data: [], message: 'error' };
  }
});
