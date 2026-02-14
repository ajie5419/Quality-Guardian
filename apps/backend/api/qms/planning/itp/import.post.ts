import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
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
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  useResponseSuccess,
} from '~/utils/response';

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
    return badRequestResponse(event, '参数错误：需要 projectId 和 items 数组');
  }

  try {
    const plan = await prisma.quality_plans.findUnique({
      where: { id: normalizedProjectId },
      include: { items: true },
    });

    if (!plan) {
      return notFoundResponse(event, '未找到目标质量计划');
    }

    const maxOrder = getMaxItpItemOrder(plan.items || []);
    const rowErrors = [];
    const validItems = normalizedItems.map((item, index) => ({
      item,
      row: index + 1,
    }));
    const createResults = await Promise.allSettled(
      validItems.map(({ item, row }, index) =>
        prisma.itp_items
          .create({
            data: buildItpItemCreateData({
              item,
              order: maxOrder + index + 1,
              projectId: normalizedProjectId,
              useImportDefaults: true,
            }),
          })
          .catch((error) => {
            const message = toImportErrorMessage(error);
            rowErrors.push(
              buildImportRowError({
                field: inferImportErrorField(message),
                item,
                keyField: 'processStep',
                reason: message,
                row,
              }),
            );
            throw error;
          }),
      ),
    );
    const successCount = createResults.filter(
      (result) => result.status === 'fulfilled',
    ).length;

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: normalizedItems.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('import', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(event, `导入失败: ${errorMessage}`);
  }
});
