import { defineEventHandler, getQuery } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const query = getQuery(event);
  const params = {
    lossSource: query.lossSource as string,
    status: query.status as string,
    workOrderNumber: query.workOrderNumber as string,
  };

  try {
    const result = await QualityLossService.getLossSummary(params);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('summary', error);
    return useResponseSuccess([]);
  }
});
