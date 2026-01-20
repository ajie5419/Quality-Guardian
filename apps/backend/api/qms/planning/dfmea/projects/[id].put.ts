import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');
  const body = await readBody(event);

  if (!id) return { code: -1, message: 'ID required' };

  try {
    // 关键修复：改为局部更新逻辑，防止 undefined 覆盖原有数据库字段
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.projectName !== undefined) updateData.projectName = body.projectName;
    if (body.workOrderId !== undefined) updateData.workOrderId = body.workOrderId;
    if (body.version !== undefined) updateData.version = body.version;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.description !== undefined) updateData.description = body.description;

    const updatedProject = await prisma.dfmea_projects.update({
      where: { id },
      data: updateData,
    });

    return {
      code: 0,
      data: updatedProject,
      message: 'ok',
    };
  } catch (error) {
    console.error('Update DFMEA project error:', error);
    return { code: -1, message: '更新失败' };
  }
});
