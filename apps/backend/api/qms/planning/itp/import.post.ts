import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildItpItemCreateData,
  getMaxItpItemOrder,
  normalizeItpText,
} from '~/utils/itp';
import prisma from '~/utils/prisma';
import {
  getMissingRequiredFields,
  parseNonEmptyArray,
} from '~/utils/request-validation';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const projectId = normalizeItpText(body.projectId);
  const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
  const normalizedProjectId = projectId || '';
  const normalizedItems = items || [];

  const missingFields = getMissingRequiredFields({ items, projectId }, [
    'projectId',
    'items',
  ]);
  if (missingFields.length > 0) {
    setResponseStatus(event, 400);
    return useResponseError('参数错误：需要 projectId 和 items 数组');
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: normalizedProjectId },
      include: { items: true },
    });

    if (!plan) {
      setResponseStatus(event, 404);
      return useResponseError('未找到目标质量计划');
    }

    const maxOrder = getMaxItpItemOrder(plan.items || []);
    const newItems = normalizedItems.map((item, index) =>
      buildItpItemCreateData({
        item,
        order: maxOrder + index + 1,
        projectId: normalizedProjectId,
        useImportDefaults: true,
      }),
    );

    await prisma.itp_items.createMany({
      data: newItems,
    });

    return useResponseSuccess({
      count: normalizedItems.length,
      message: '导入成功',
    });
  } catch (error: unknown) {
    logApiError('import', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    setResponseStatus(event, 500);
    return useResponseError(`导入失败: ${errorMessage}`);
  }
});
