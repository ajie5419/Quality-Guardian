import { defineEventHandler, readBody } from 'h3';
import { nanoid } from 'nanoid';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const { items, projectId } = body;

  try {
    // 获取项目信息以获取工单号
    const bomProject = await prisma.bom_projects.findUnique({
      where: { id: projectId },
    });

    if (!bomProject) {
      return { code: 404, message: '项目不存在' };
    }

    const workOrderNumber = bomProject.workOrderNumber;

    let successCount = 0;
    if (items && Array.isArray(items)) {
      // 批量创建 BOM 物料
      for (const item of items) {
        try {
          await prisma.project_boms.create({
            data: {
              id: `BOM-${nanoid(6).toUpperCase()}`,
              work_order_number: workOrderNumber,
              part_name: String(item.partName || '未命名部件'),
              part_number: item.partNumber ? String(item.partNumber) : null,
              material: item.material ? String(item.material) : null,
              quantity: Number(item.quantity || 1),
              unit: item.unit ? String(item.unit) : 'PCS',
              remarks: item.remarks ? String(item.remarks) : null,
              updated_at: new Date(),
            },
          });
          successCount++;
        } catch (error) {
          logApiError('bom-import-item', error);
        }
      }
    }

    return {
      code: 0,
      data: { successCount },
      message: 'ok',
    };
  } catch (error) {
    logApiError('bom-import', error);
    return { code: -1, message: '导入 BOM 失败' };
  }
});
