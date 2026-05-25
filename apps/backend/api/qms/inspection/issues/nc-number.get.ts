import { defineEventHandler } from 'h3';
import { InspectionService } from '~/modules/inspection/inspection.service';
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
    const ncNumber = await InspectionService.generateNextNcNumber();
    return useResponseSuccess({ ncNumber });
  } catch (error) {
    logApiError('nc-number', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to generate nc number');
  }
});
