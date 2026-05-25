import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const result = await InspectionApiService.getRequestList(
      userinfo,
      schema.parse(getQuery(event)),
    );
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-request-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取报检任务失败');
  }
});
