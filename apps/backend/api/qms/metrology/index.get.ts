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
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event);
    const result = await MetrologyService.getList({
      inspectionStatus:
        String(query.inspectionStatus || '').trim() || undefined,
      instrumentCode: String(query.instrumentCode || '').trim() || undefined,
      instrumentName: String(query.instrumentName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
      model: String(query.model || '').trim() || undefined,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
      sortBy: String(query.sortBy || '').trim() || undefined,
      sortOrder:
        query.sortOrder === 'asc' || query.sortOrder === 'desc'
          ? query.sortOrder
          : undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      validFrom: String(query.validFrom || '').trim() || undefined,
      validTo: String(query.validTo || '').trim() || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-list', error);
    return internalServerErrorResponse(event, 'Failed to fetch metrology list');
  }
});
