import { defineEventHandler, getQuery } from 'h3';
import { InspectionRequestQueryService } from '~/modules/inspection/inspection-request-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const requestNo = String(getQuery(event).requestNo || '').trim();
  if (!requestNo) {
    return badRequestResponse(event, 'requestNo is required');
  }
  try {
    const status =
      await InspectionRequestQueryService.getPublicRequestStatus(requestNo);
    return useResponseSuccess(status);
  } catch (error) {
    logApiError('inspection-request-public-status', error, undefined, event);
    return internalServerErrorResponse(event, '查询报检状态失败');
  }
});
