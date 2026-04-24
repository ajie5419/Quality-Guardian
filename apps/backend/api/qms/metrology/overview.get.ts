import { defineEventHandler, getQuery } from 'h3';
import { MetrologyService } from '~/services/metrology.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event);
    const overview = await MetrologyService.getOverview({
      inspectionStatus:
        String(query.inspectionStatus || '').trim() || undefined,
      instrumentCode: String(query.instrumentCode || '').trim() || undefined,
      instrumentName: String(query.instrumentName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
      model: String(query.model || '').trim() || undefined,
      sortBy: String(query.sortBy || '').trim() || undefined,
      sortOrder:
        query.sortOrder === 'asc' || query.sortOrder === 'desc'
          ? query.sortOrder
          : undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      validFrom: String(query.validFrom || '').trim() || undefined,
      validTo: String(query.validTo || '').trim() || undefined,
    });
    return useResponseSuccess(overview);
  } catch (error) {
    logApiError('metrology-overview', error);
    return internalServerErrorResponse(event, '获取计量器具概览失败');
  }
});
