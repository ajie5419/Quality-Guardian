import { defineEventHandler, getQuery } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseQualityLossCommonQuery } from '~/utils/quality-loss-query';
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

  const query = getQuery(event) as Record<string, unknown>;
  const params = parseQualityLossCommonQuery(query);

  try {
    const result = await QualityLossService.getLossSummary(params);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('summary', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch quality loss summary',
    );
  }
});
