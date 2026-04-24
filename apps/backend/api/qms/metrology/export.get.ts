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
    const result = await MetrologyService.getExportList({
      inspectionStatus:
        String(query.inspectionStatus || '').trim() || undefined,
      instrumentCode: String(query.instrumentCode || '').trim() || undefined,
      instrumentName: String(query.instrumentName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
      model: String(query.model || '').trim() || undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      validFrom: String(query.validFrom || '').trim() || undefined,
      validTo: String(query.validTo || '').trim() || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-export', error);
    return internalServerErrorResponse(
      event,
      'Failed to export metrology list',
    );
  }
});
