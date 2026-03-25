import { defineEventHandler, getQuery } from 'h3';
import { WelderService } from '~/services/welder.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { parseWelderListQuery } from '~/utils/welder';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const query = getQuery(event) as Record<string, unknown>;
    const result = await WelderService.findAll(parseWelderListQuery(query));
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('welder', error);
    return internalServerErrorResponse(event, 'Failed to fetch welders');
  }
});
