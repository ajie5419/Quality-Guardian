import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { stringifyItpQuantitativeItems } from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { projectId, items } = body;

  if (!projectId || !items || !Array.isArray(items)) {
    setResponseStatus(event, 400);
    return useResponseError('参数错误：需要 projectId 和 items 数组');
  }

  interface ItpImportItem {
    processStep?: string;
    activity?: string;
    controlPoint?: string;
    acceptanceCriteria?: string;
    referenceDoc?: string;
    frequency?: string;
    verifyingDocument?: string;
    isQuantitative?: boolean | number;
    quantitativeItems?: unknown[];
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: projectId },
      include: { items: true },
    });

    if (!plan) {
      setResponseStatus(event, 404);
      return useResponseError('未找到目标质量计划');
    }

    const existingCount = plan.items.length;

    // 关键修复：改为向 itp_items 物理表批量插入数据
    const newItems = (items as ItpImportItem[]).map((item, index) => ({
      projectId,
      processStep: item.processStep || '组对',
      activity: item.activity || '',
      controlPoint: item.controlPoint || 'W',
      acceptanceCriteria: item.acceptanceCriteria || '',
      referenceDoc: item.referenceDoc || '',
      frequency: item.frequency || '100%',
      verifyingDocument: item.verifyingDocument || '',
      isQuantitative: !!item.isQuantitative,
      quantitativeItems: stringifyItpQuantitativeItems(item.quantitativeItems),
      order: existingCount + index + 1,
    }));

    await prisma.itp_items.createMany({
      data: newItems,
    });

    return useResponseSuccess({
      count: items.length,
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
