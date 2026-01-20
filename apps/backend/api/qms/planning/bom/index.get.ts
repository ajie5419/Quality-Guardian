import { defineEventHandler, getQuery } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const query = getQuery(event);
  const workOrderNumber = query.projectId as string; // BOM 模块中的 projectId 实际上是工单号

  try {
    if (workOrderNumber) {
      const items = await prisma.project_boms.findMany({
        where: { work_order_number: workOrderNumber },
        orderBy: { created_at: 'desc' },
      });

      return {
        code: 0,
        data: items.map(item => ({
            id: item.id,
            name: item.part_name,
            partNumber: item.part_number,
            quantity: item.quantity,
            unit: item.unit,
            material: item.material,
            remarks: item.remarks,
            parentId: item.work_order_number
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
    console.error('Fetch BOM items error:', error);
    return { code: 0, data: [], message: 'error' };
  }
});
