import { defineEventHandler, readBody } from 'h3';
import { WelderScoreService } from '~/services/welder-score.service';
import { logApiError } from '~/utils/api-logger';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import {
  buildInspectionIssueUpsertPayload,
  getNextInspectionIssueSerialNumber,
} from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);

    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    let successCount = 0;
    const rowErrors = [];
    let serialSeed = await getNextInspectionIssueSerialNumber();
    for (const [index, item] of items.entries()) {
      try {
        const payload = buildInspectionIssueUpsertPayload(item, serialSeed);
        if (!payload) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'ncNumber',
              reason: '缺少有效的工单号',
              row: index + 1,
              suggestion: '请填写可关联的工单号',
            }),
          );
          continue;
        }
        serialSeed++;

        await prisma.quality_records.upsert(payload);
        successCount++;
      } catch (error) {
        logApiError('import', error);
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'ncNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    if (successCount > 0) {
      await WelderScoreService.syncFromInspectionIssues();
    }

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: items.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('import', error);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
