import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionRequestQueryService } from '~/modules/inspection/inspection-request-query.service';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);

  try {
    const result = await InspectionRequestQueryService.getRequestList(
      userinfo,
      schema.parse(getQuery(event)),
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-request-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取报检任务失败');
  }
});
