import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { buildProjectBomCreateData, normalizeBomText } from '~/utils/bom';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const body = await readBody(event);
  const items = Array.isArray(body.items) ? body.items : [];
  const projectId = normalizeBomText(body.projectId);

  if (!projectId || items.length === 0) {
    setResponseStatus(event, 400);
    return useResponseError('参数错误：需要 projectId 和 items 数组');
  }

  try {
    const bomProject = await prisma.bom_projects.findUnique({
      where: { id: projectId },
      select: { workOrderNumber: true },
    });

    if (!bomProject) {
      setResponseStatus(event, 404);
      return useResponseError('项目不存在');
    }

    const createResults = await Promise.allSettled(
      items.map((item) =>
        prisma.project_boms.create({
          data: buildProjectBomCreateData(bomProject.workOrderNumber, item),
        }),
      ),
    );

    const successCount = createResults.filter(
      (result) => result.status === 'fulfilled',
    ).length;
    const failedCount = createResults.length - successCount;

    for (const result of createResults) {
      if (result.status === 'rejected') {
        logApiError('bom-import-item', result.reason);
      }
    }

    return useResponseSuccess({
      failedCount,
      successCount,
      totalCount: items.length,
    });
  } catch (error) {
    logApiError('bom-import', error);
    setResponseStatus(event, 500);
    return useResponseError('导入 BOM 失败');
  }
});
