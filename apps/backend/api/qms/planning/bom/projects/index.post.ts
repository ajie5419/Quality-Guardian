import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { workOrderNumber } = body;

    if (!workOrderNumber) {
      return useResponseError('工单号不能为空');
    }

    // 检查工单是否存在
    const wo = await prisma.work_orders.findUnique({
      where: { workOrderNumber },
    });

    if (!wo) {
      return useResponseError('工单不存在');
    }

    // 检查是否已在 BOM 策划中
    const existing = await prisma.bom_projects.findUnique({
      where: { workOrderNumber },
    });

    if (existing) {
      if (existing.isDeleted) {
        // 恢复
        const updated = await prisma.bom_projects.update({
          where: { id: existing.id },
          data: { isDeleted: false, updatedAt: new Date() },
        });
        return useResponseSuccess(updated);
      }
      return useResponseError('该工单已在 BOM 策划列表中');
    }

    // 创建 BOM 项目
    const newProject = await prisma.bom_projects.create({
      data: {
        workOrderNumber,
        projectName: wo.projectName || workOrderNumber,
        status: 'active',
      },
    });

    return useResponseSuccess(newProject);
  } catch (error) {
    logApiError('projects', error);
    return useResponseError('添加 BOM 项目失败');
  }
});
