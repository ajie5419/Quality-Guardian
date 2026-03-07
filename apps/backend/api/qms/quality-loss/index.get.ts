import { defineEventHandler, getQuery } from 'h3';
import { QualityLossService } from '~/services/quality-loss.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { parseQualityLossListQuery } from '~/utils/quality-loss-query';
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

  const query = getQuery(event) as Record<string, unknown>;
  const params = parseQualityLossListQuery(query);

  try {
    const result = await QualityLossService.getAllLosses({
      ...params,
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('quality-loss', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch quality loss list',
    );
  }
});
