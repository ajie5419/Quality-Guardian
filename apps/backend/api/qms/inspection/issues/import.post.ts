import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({ items: z.unknown() });

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const body = schema.parse(await readBody(event));
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    if (!items) return badRequestResponse(event, '未发现可导入的数据');
    return useResponseSuccess(
      await InspectionApiService.importIssues(event, userinfo, items),
    );
  } catch (error: unknown) {
    logApiError('import', error, undefined, event);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
