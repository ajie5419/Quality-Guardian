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
import { parseNonEmptyIdList } from '~/utils/id-list';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({ ids: z.unknown().optional() });

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    await authorizeWrite(event, INSPECTION_ISSUE_PERMISSION_CODES.DELETE);
    const body = schema.parse(await readBody(event));
    const ids = parseNonEmptyIdList(body.ids);
    if (!ids) return badRequestResponse(event, '请提供有效的 ID 列表');
    return useResponseSuccess({
      successCount: await InspectionApiService.batchDeleteIssues(
        event,
        userinfo,
        ids,
      ),
    });
  } catch (error) {
    logApiError('batch-delete', error, undefined, event);
    const businessError = legacyErrorToBusinessError(error);
    if (businessError) return businessErrorResponse(event, businessError);
    return internalServerErrorResponse(event, '批量删除失败');
  }
});
