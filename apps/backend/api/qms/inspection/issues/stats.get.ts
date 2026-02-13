import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { parseOptionalIssueYear } from '~/utils/inspection-issue';
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

  const query = getQuery(event) as Record<string, unknown>;
  const year = parseOptionalIssueYear(query.year);

  try {
    const result = await InspectionService.getIssueStats(year);
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('inspection-issue-stats', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection issue stats',
    );
  }
});
