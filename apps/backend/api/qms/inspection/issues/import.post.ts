import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
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
    let serialSeed = await getNextInspectionIssueSerialNumber();
    for (const item of items) {
      try {
        const payload = buildInspectionIssueUpsertPayload(item, serialSeed);
        if (!payload) continue;
        serialSeed++;

        await prisma.quality_records.upsert(payload);
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('import', error);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
