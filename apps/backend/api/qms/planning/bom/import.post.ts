import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { buildProjectBomCreateData, normalizeBomText } from '~/utils/bom';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import { awaitMockDelay } from '~/utils/index';
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
  await awaitMockDelay();
  const body = await readBody(event);
  const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
  const projectId = normalizeBomText(body.projectId);
  const normalizedItems = items || [];
  const normalizedProjectId = projectId || '';

  const missingFields = getMissingRequiredFields({ items, projectId }, [
    'projectId',
    'items',
  ]);
  if (missingFields.length > 0) {
    return badRequestResponse(event, '参数错误：需要 projectId 和 items 数组');
  }

  try {
    const bomProject = await prisma.bom_projects.findUnique({
      where: { id: normalizedProjectId },
      select: { workOrderNumber: true },
    });

    if (!bomProject) {
      return notFoundResponse(event, '项目不存在');
    }

    const rowErrors = [];
    const createResults = await Promise.allSettled(
      normalizedItems.map((item) =>
        prisma.project_boms.create({
          data: buildProjectBomCreateData(bomProject.workOrderNumber, item),
        }),
      ),
    );

    const successCount = createResults.filter(
      (result) => result.status === 'fulfilled',
    ).length;

    createResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        logApiError('bom-import-item', result.reason);
        const message = toImportErrorMessage(result.reason);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item: normalizedItems[index],
            keyField: 'part_number',
            reason: message,
            row: index + 1,
          }),
        );
      }
    });

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: normalizedItems.length,
      }),
    );
  } catch (error) {
    logApiError('bom-import', error);
    return internalServerErrorResponse(event, '导入 BOM 失败');
  }
});
