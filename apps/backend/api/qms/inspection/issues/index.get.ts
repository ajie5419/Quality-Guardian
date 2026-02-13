import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { parseInspectionIssueListQuery } from '~/utils/inspection-issue';
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
  const params = parseInspectionIssueListQuery(query);

  try {
    const result = await InspectionService.getIssues(params);

    return useResponseSuccess(result);
  } catch (error) {
    logApiError('issues', error);
    return internalServerErrorResponse(
      event,
      'Failed to fetch inspection issues',
    );
  }
});
