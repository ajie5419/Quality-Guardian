import { defineEventHandler, getQuery } from 'h3';
import { MetrologyCalibrationPlanService } from '~/services/metrology-calibration-plan.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event);
    const result = await MetrologyCalibrationPlanService.getList({
      keyword: String(query.keyword || '').trim() || undefined,
      month: Number(query.month || 0) || undefined,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      sortBy: String(query.sortBy || '').trim() || undefined,
      sortOrder:
        query.sortOrder === 'asc' || query.sortOrder === 'desc'
          ? query.sortOrder
          : undefined,
      status: String(query.status || '').trim() || undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      year: Number(query.year || 0) || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-calibration-plan-list', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch metrology calibration plan list',
    );
  }
});
