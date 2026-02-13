import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildProjectBomCreateData,
  createBomProjectId,
  mapProjectBomItem,
  normalizeBomText,
} from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const workOrderNumber = normalizeBomText(body.workOrderNumber);
  if (!workOrderNumber) {
    setResponseStatus(event, 400);
    return useResponseError('缺少必填字段: workOrderNumber');
  }

  try {
    // 检查是否已存在 bom_projects 记录，如果不存在则创建
    let bomProject = await prisma.bom_projects.findUnique({
      where: { workOrderNumber },
    });

    if (!bomProject) {
      // 获取工单信息
      const workOrder = await prisma.work_orders.findUnique({
        where: { workOrderNumber },
      });
      if (!workOrder) {
        setResponseStatus(event, 400);
        return useResponseError('工单不存在');
      }

      bomProject = await prisma.bom_projects.create({
        data: {
          id: createBomProjectId(),
          workOrderNumber,
          projectName:
            normalizeBomText(body.projectName) ||
            workOrder.projectName ||
            workOrderNumber,
          status: 'active',
        },
      });
    }

    // 创建 BOM 物料明细
    const newItem = await prisma.project_boms.create({
      data: buildProjectBomCreateData(workOrderNumber, body),
    });

    return useResponseSuccess({
      ...mapProjectBomItem(newItem),
      projectId: bomProject.id,
    });
  } catch (error) {
    logApiError('bom', error);
    setResponseStatus(event, 500);
    return useResponseError('添加物料失败');
  }
});
