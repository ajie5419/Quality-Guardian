import { defineEventHandler } from 'h3';
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
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
    lossSource: query.lossSource as string,
    status: query.status as string,
    workOrderNumber: query.workOrderNumber as string,
  };

  try {
    const result = await QualityLossService.getAllLosses(params);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('quality-loss', error);
    return useResponseSuccess({ items: [], total: 0 });
  }
});
