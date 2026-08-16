import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  businessErrorResponse,
  legacyErrorToBusinessError,
} from '~/utils/business-error';
import { getCurrentUser } from '~/utils/current-user';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z
  .object({
    generateNcNumber: z.boolean().default(false),
    items: z.unknown(),
  })
  .strict();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.CREATE);
    const body = schema.parse(await readBody(event));
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    if (!items) return badRequestResponse(event, '未发现可导入的数据');
    return useResponseSuccess(
      await InspectionApiService.importIssues(
        event,
        userinfo,
        items,
        body.generateNcNumber,
      ),
    );
  } catch (error: unknown) {
    logApiError('import', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
