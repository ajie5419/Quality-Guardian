import type { H3Event } from 'h3';

import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import {
  buildItpItemCreateData,
  getMaxItpItemOrder,
  normalizeItpText,
} from '~/modules/planning/itp';
import { logApiError } from '~/utils/api-logger';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';

export async function itp_import_post(event: H3Event) {
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
      validItems.map(async ({ item, row }, index) => {
        const baseCreateData = buildItpItemCreateData({
          item,
          order: maxOrder + index + 1,
          projectId: normalizedProjectId,
          useImportDefaults: true,
        });
        const governedCanonicalIds =
          await buildGovernedCanonicalWritePairForTable(
            'itp_items',
            baseCreateData as Record<string, unknown>,
          );
        const governedFields = buildGovernedWriteFieldsForTable(
          'itp_items',
          baseCreateData as Record<string, unknown>,
        );
        return prisma.itp_items
          .create({
            data: {
              ...baseCreateData,
              ...governedFields,
              ...governedCanonicalIds,
            },
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
          });
      }),
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
    logApiError('import', error, undefined, event);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return internalServerErrorResponse(event, `导入失败: ${errorMessage}`);
  }
}
