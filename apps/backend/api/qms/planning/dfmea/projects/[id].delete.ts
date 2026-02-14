import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 项目不存在');
    }
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(event, `Delete failed: ${errorMessage}`);
  }
});
