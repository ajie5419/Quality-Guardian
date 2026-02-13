import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  createBomItemId,
  normalizeBomText,
  parseBomQuantity,
} from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const { items, projectId } = body;
  if (!projectId || !Array.isArray(items) || items.length === 0) {
    setResponseStatus(event, 400);
    return useResponseError('参数错误：需要 projectId 和 items 数组');
  }

  try {
    // 获取项目信息以获取工单号
    const bomProject = await prisma.bom_projects.findUnique({
      where: { id: projectId },
    });

    if (!bomProject) {
      setResponseStatus(event, 404);
      return useResponseError('项目不存在');
    }

    const workOrderNumber = bomProject.workOrderNumber;

    let successCount = 0;
    for (const item of items) {
      try {
        await prisma.project_boms.create({
          data: {
            id: createBomItemId(),
            work_order_number: workOrderNumber,
            part_name: normalizeBomText(item.partName) || '未命名部件',
            part_number: normalizeBomText(item.partNumber) || null,
            material: normalizeBomText(item.material) || null,
            quantity: parseBomQuantity(item.quantity, 1),
            unit: normalizeBomText(item.unit) || 'PCS',
            remarks: normalizeBomText(item.remarks) || null,
            updated_at: new Date(),
          },
        });
        successCount++;
      } catch (error) {
        logApiError('bom-import-item', error);
      }
    }

    return useResponseSuccess({ successCount });
  } catch (error) {
    logApiError('bom-import', error);
    setResponseStatus(event, 500);
    return useResponseError('导入 BOM 失败');
  }
});
