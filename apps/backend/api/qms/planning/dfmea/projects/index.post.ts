import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { nanoid } from 'nanoid';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);

  try {
    // 关键修复：从内存列表存储改为 Prisma 数据库存储
    // 同时确保 workOrderId 是工单编号字符串（满足外键约束）
    const newProject = await prisma.dfmea_projects.create({
      data: {
        id: `DFMEA-${nanoid(6).toUpperCase()}`,
        projectName: body.projectName,
        workOrderId: body.workOrderId || null,
        version: body.version || 'V1.0',
        status: body.status || 'active',
        description: body.description || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'admin',
        isDeleted: false,
      },
    });

    return {
      code: 0,
      data: newProject,
      message: 'ok',
    };
  } catch (error) {
    logApiError('projects', error);
    setResponseStatus(event, 500);
    return { code: -1, message: '创建项目失败，请检查工单号是否存在' };
  }
});
