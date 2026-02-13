import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('id required');
  }

  try {
    // 使用 Prisma 事务或级联删除（如果配置了）
    // 这里我们手动将项目及其关联条目标记为已删除
    await prisma.$transaction([
      prisma.dfmea.updateMany({
        where: { projectId: id },
        data: { isDeleted: true },
      }),
      prisma.dfmea_projects.update({
        where: { id },
        data: { isDeleted: true },
      }),
    ]);

    return useResponseSuccess({ message: 'Deleted' });
  } catch (error: unknown) {
    logApiError('dfmea-projects', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(`Delete failed: ${errorMessage}`);
  }
});
